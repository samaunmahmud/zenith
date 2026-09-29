package com.zenith.data;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;

/**
 * Finds US-listed stocks by ticker or company name, so "sandisk" leads to SNDK.
 *
 * <p>Asks FMP's symbol and name searches together, then keeps only what the committee can analyse: primary US
 * listings (NASDAQ, NYSE, NYSE American) with a plain ticker. Foreign lines ("SNDK.TO"), mutual funds ("APPLX") and
 * a stock's own when-issued, warrant, unit or rights lines ("SNDKV" beside "SNDK") are dropped. Exact ticker matches rank first, then tickers starting with the
 * query, then company names.
 *
 * <p>Results are kept in memory for a day: the search runs on every keystroke, and FMP's free plan is 250 calls a
 * day. When FMP can't be asked (demo mode, no key, an outage), the stocks already cached on disk are searched instead.
 */
@Service
public class SymbolSearch {

    private static final Logger log = LoggerFactory.getLogger(SymbolSearch.class);

    static final int LIMIT = 6;
    static final int MAX_QUERY = 40;
    private static final Set<String> US_EXCHANGES = Set.of("NASDAQ", "NYSE", "AMEX");
    private static final Pattern PLAIN_TICKER = Pattern.compile("^[A-Z][A-Z0-9-]{0,9}$");
    private static final Pattern MUTUAL_FUND = Pattern.compile("^[A-Z]{4}X$");
    private static final Duration TTL = Duration.ofHours(24);
    private static final int MAX_ENTRIES = 1000;
    private static final JavaType PROFILE = Json.MAPPER.constructType(CompanyProfile.class);

    private record Cached(List<SymbolMatch> matches, Instant at) {}

    private final Function<String, List<SymbolMatch>> bySymbol;
    private final Function<String, List<SymbolMatch>> byName;
    private final DiskCache cache;
    private final boolean offline;
    private final Map<String, Cached> memo = new ConcurrentHashMap<>();

    @Autowired
    public SymbolSearch(FmpClient fmp, DiskCache cache, ZenithProperties props) {
        this(fmp::searchSymbol, fmp::searchName, cache, props.demoMode() || ZenithProperties.isBlank(props.marketData().fmpApiKey()));
    }

    SymbolSearch(Function<String, List<SymbolMatch>> bySymbol, Function<String, List<SymbolMatch>> byName, DiskCache cache, boolean offline) {
        this.bySymbol = bySymbol;
        this.byName = byName;
        this.cache = cache;
        this.offline = offline;
    }

    /** Up to {@value #LIMIT} US-listed matches for {@code raw}, best first; empty for a blank or oversized query. */
    public List<SymbolMatch> search(String raw) {
        String q = raw == null ? "" : raw.trim();
        if (q.isEmpty() || q.length() > MAX_QUERY) return List.of();
        String key = q.toLowerCase(Locale.ROOT);
        Cached hit = memo.get(key);
        if (hit != null && hit.at().plus(TTL).isAfter(Instant.now())) return hit.matches();

        List<SymbolMatch> found;
        if (offline) {
            found = fromDisk(q);
        } else {
            try {
                var symbols = CompletableFuture.supplyAsync(() -> bySymbol.apply(q));
                var names = CompletableFuture.supplyAsync(() -> byName.apply(q));
                List<SymbolMatch> all = new ArrayList<>(symbols.join());
                all.addAll(names.join());
                found = rank(q, all);
            } catch (RuntimeException e) {
                log.warn("Symbol search for '{}' failed, searching the cache instead: {}", q, e.getMessage());
                return fromDisk(q); // not memoised: the live search may work next time
            }
        }
        if (memo.size() >= MAX_ENTRIES) memo.clear();
        memo.put(key, new Cached(found, Instant.now()));
        return found;
    }

    /** Filters to plain US listings, drops when-issued duplicates, ranks, dedupes and trims. Package-private for tests. */
    static List<SymbolMatch> rank(String query, List<SymbolMatch> candidates) {
        String q = query.trim().toUpperCase(Locale.ROOT);
        String qName = query.trim().toLowerCase(Locale.ROOT);
        Map<String, SymbolMatch> bySymbol = new LinkedHashMap<>();
        for (SymbolMatch m : candidates) {
            String exchange = m.exchange() == null ? "" : m.exchange().toUpperCase(Locale.ROOT);
            if (!US_EXCHANGES.contains(exchange) || !PLAIN_TICKER.matcher(m.symbol()).matches()) continue;
            bySymbol.putIfAbsent(m.symbol(), m);
        }
        // Mutual funds (five letters ending in X, "APPLX") have no company fundamentals for the analysts to read.
        bySymbol.values().removeIf(m -> MUTUAL_FUND.matcher(m.symbol()).matches());
        // A suffixed line next to its stock for the same company is not a separate stock: when-issued ("SNDKV"),
        // warrants ("BGRYW"), units ("...U") or rights ("...R").
        bySymbol.values().removeIf(m -> {
            String s = m.symbol();
            if (s.length() < 2 || "VWUR".indexOf(s.charAt(s.length() - 1)) < 0) return false;
            SymbolMatch base = bySymbol.get(s.substring(0, s.length() - 1));
            return base != null && base.name().equalsIgnoreCase(m.name());
        });

        Comparator<SymbolMatch> order = Comparator.<SymbolMatch>comparingInt(m -> {
                    if (m.symbol().equals(q)) return 0;
                    if (m.symbol().startsWith(q)) return 1;
                    if (m.name().toLowerCase(Locale.ROOT).startsWith(qName)) return 2;
                    return 3;
                })
                .thenComparingInt(m -> m.symbol().length())
                .thenComparing(SymbolMatch::symbol);
        return bySymbol.values().stream().sorted(order).limit(LIMIT).toList();
    }

    /** Stocks already cached on disk whose ticker starts with, or company name contains, the query. */
    List<SymbolMatch> fromDisk(String q) {
        String up = q.trim().toUpperCase(Locale.ROOT);
        String low = q.trim().toLowerCase(Locale.ROOT);
        return rank(q, onDisk().stream()
                .filter(m -> m.symbol().startsWith(up) || m.name().toLowerCase(Locale.ROOT).contains(low))
                .toList());
    }

    private List<SymbolMatch> onDisk() {
        List<SymbolMatch> out = new ArrayList<>();
        for (String ticker : cache.tickersWith("profile")) {
            cache.<CompanyProfile>read(ticker, "profile", PROFILE).ifPresent(e -> {
                CompanyProfile p = e.data();
                String exchange = p.exchange() == null ? "NASDAQ" : p.exchange();
                out.add(new SymbolMatch(ticker, p.companyName() == null ? ticker : p.companyName(), exchange));
            });
        }
        return out;
    }
}
