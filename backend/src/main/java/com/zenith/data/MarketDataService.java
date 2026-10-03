package com.zenith.data;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;

/**
 * Fetches everything the committee needs for one ticker, cache-first, with the independent calls in parallel.
 * FMP is the primary source. Its free plan covers only some symbols, so when it answers "not on your plan" prices
 * fall back to Tiingo and the profile to Finnhub (then Tiingo, which also knows ETFs). Finnhub's basic financials
 * fill in fundamentals FMP doesn't give, including forward P/E.
 */
@Service
public class MarketDataService {

    private static final Logger log = LoggerFactory.getLogger(MarketDataService.class);
    public static final String BENCHMARK = "SPY";

    private static final JavaType PROFILE = Json.MAPPER.constructType(CompanyProfile.class);
    private static final JavaType BARS = Json.MAPPER.getTypeFactory().constructCollectionType(List.class, PriceBar.class);
    private static final JavaType RAW = Json.MAPPER.getTypeFactory().constructMapType(Map.class, String.class, Object.class);
    private static final JavaType NEWS = Json.MAPPER.getTypeFactory().constructCollectionType(List.class, NewsItem.class);

    private final DiskCache cache;
    private final FmpClient fmp;
    private final FinnhubClient finnhub;
    private final TiingoClient tiingo;
    private final ZenithProperties props;

    public MarketDataService(DiskCache cache, FmpClient fmp, FinnhubClient finnhub, TiingoClient tiingo, ZenithProperties props) {
        this.cache = cache;
        this.fmp = fmp;
        this.finnhub = finnhub;
        this.tiingo = tiingo;
        this.props = props;
    }

    public MarketData get(String ticker) {
        // Profile first: it fails fast on a bad ticker before we spend the other API calls.
        DiskCache.Result<CompanyProfile> profile = explainPlanLimit(ticker, () -> cache.cachedFrom(ticker, "profile", PROFILE, List.of(
                new DiskCache.Provider<>("FMP profile", () -> fmp.profile(ticker)),
                new DiskCache.Provider<>("Finnhub profile", () -> finnhub.profile(ticker, finnhubKey())),
                new DiskCache.Provider<>("Tiingo profile", () -> tiingo.profile(ticker)))));

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var prices = async(pool, () -> prices(ticker));
            var benchmark = async(pool, () -> prices(BENCHMARK));
            // Fundamentals and news are optional: if they fail, the analysts are told the data is missing.
            var ratios = optional(pool, "ratios", () -> cache.<Map<String, Object>>cached(ticker, "ratios-ttm", "FMP ratios (TTM)", RAW, () -> fmp.ratiosTtm(ticker)));
            var metrics = optional(pool, "key metrics", () -> cache.<Map<String, Object>>cached(ticker, "key-metrics-ttm", "FMP key metrics (TTM)", RAW, () -> fmp.keyMetricsTtm(ticker)));
            var growth = optional(pool, "growth", () -> cache.<Map<String, Object>>cached(ticker, "growth", "FMP financial growth", RAW, () -> fmp.growth(ticker)));
            var news = optional(pool, "news", () -> news(ticker));
            var basics = optional(pool, "Finnhub basic financials", () -> finnhubMetrics(ticker));

            List<SourceInfo> sources = new ArrayList<>();
            sources.add(profile.source());
            for (var f : List.of(prices, benchmark, ratios, metrics, growth, basics, news)) {
                DiskCache.Result<?> r = join(f);
                if (r != null) sources.add(r.source());
            }
            return new MarketData(
                    ticker,
                    profile.data(),
                    join(prices).data(),
                    join(benchmark).data(),
                    dataOr(join(ratios), Map.of()),
                    dataOr(join(metrics), Map.of()),
                    dataOr(join(growth), Map.of()),
                    dataOr(join(basics), Map.of()),
                    dataOr(join(news), List.of()),
                    sources);
        }
    }

    /**
     * About 13 months of completed daily bars, cache-first (the track record scores past calls against these).
     * A bar still trading when it was fetched is left out: see {@link TradingDay}.
     */
    public DiskCache.Result<List<PriceBar>> prices(String ticker) {
        String suffix = BENCHMARK.equals(ticker) ? " (SPY)" : "";
        DiskCache.Result<List<PriceBar>> raw = explainPlanLimit(ticker, () -> cache.cachedFrom(ticker, "prices", BARS, List.of(
                new DiskCache.Provider<>("FMP daily prices" + suffix, () -> fmp.prices(ticker, 400)),
                new DiskCache.Provider<>("Tiingo daily prices" + suffix, () -> tiingo.prices(ticker, 400)))));
        return new DiskCache.Result<>(TradingDay.completed(raw.data(), raw.source().fetchedAt()), raw.source());
    }

    private DiskCache.Result<List<NewsItem>> news(String ticker) {
        String key = props.marketData().finnhubApiKey();
        if (ZenithProperties.isBlank(key) && !props.demoMode()) return null;
        return cache.cached(ticker, "news", "Finnhub news", NEWS, () -> finnhub.news(ticker, key, 14, 12));
    }

    private DiskCache.Result<Map<String, Object>> finnhubMetrics(String ticker) {
        String key = props.marketData().finnhubApiKey();
        if (ZenithProperties.isBlank(key) && !props.demoMode()) return null;
        return cache.cached(ticker, "finnhub-metrics", "Finnhub basic financials", RAW, () -> finnhub.metrics(ticker, key));
    }

    private String finnhubKey() {
        String key = props.marketData().finnhubApiKey();
        if (ZenithProperties.isBlank(key) && !props.demoMode()) throw new DataException("Finnhub is not configured", 503);
        return key;
    }

    /** Every provider is plan-limited or failed after FMP's plan limit: say so in words, not "HTTP 402". */
    private <T> T explainPlanLimit(String ticker, Supplier<T> fetch) {
        try {
            return fetch.get();
        } catch (PlanLimitException e) {
            throw new DataException(ticker + " isn't covered by the free market data plans this app uses"
                    + (tiingo.configured() ? "." : ". Adding a TIINGO_API_KEY (free) covers every US stock and ETF."), 422);
        }
    }

    private static <T> CompletableFuture<T> async(ExecutorService pool, Supplier<T> task) {
        return CompletableFuture.supplyAsync(task, pool);
    }

    private static <T> CompletableFuture<T> optional(ExecutorService pool, String what, Supplier<T> task) {
        return async(pool, task).exceptionally(e -> {
            log.warn("Optional {} data unavailable: {}", what, e.getMessage());
            return null;
        });
    }

    private static <T> T join(CompletableFuture<T> f) {
        try {
            return f.join();
        } catch (CompletionException e) {
            if (e.getCause() instanceof RuntimeException re) throw re; // e.g. DataException → proper HTTP status
            throw e;
        }
    }

    private static <T> T dataOr(DiskCache.Result<T> r, T fallback) {
        return r == null || r.data() == null ? fallback : r.data();
    }
}
