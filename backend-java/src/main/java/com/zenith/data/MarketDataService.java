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

/** Fetches everything the committee needs for one ticker, cache-first, with the independent calls in parallel. */
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
    private final ZenithProperties props;

    public MarketDataService(DiskCache cache, FmpClient fmp, FinnhubClient finnhub, ZenithProperties props) {
        this.cache = cache;
        this.fmp = fmp;
        this.finnhub = finnhub;
        this.props = props;
    }

    public MarketData get(String ticker) {
        // Profile first: it fails fast on a bad ticker before we spend the other API calls.
        DiskCache.Result<CompanyProfile> profile = cache.cached(ticker, "profile", "FMP profile", PROFILE, () -> fmp.profile(ticker));

        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var prices = async(pool, () -> cache.<List<PriceBar>>cached(ticker, "prices", "FMP daily prices", BARS, () -> fmp.prices(ticker, 400)));
            var benchmark = async(pool, () -> cache.<List<PriceBar>>cached(BENCHMARK, "prices", "FMP daily prices (SPY)", BARS, () -> fmp.prices(BENCHMARK, 400)));
            // Fundamentals and news are optional: if they fail, the analysts are told the data is missing.
            var ratios = optional(pool, "ratios", () -> cache.<Map<String, Object>>cached(ticker, "ratios-ttm", "FMP ratios (TTM)", RAW, () -> fmp.ratiosTtm(ticker)));
            var metrics = optional(pool, "key metrics", () -> cache.<Map<String, Object>>cached(ticker, "key-metrics-ttm", "FMP key metrics (TTM)", RAW, () -> fmp.keyMetricsTtm(ticker)));
            var growth = optional(pool, "growth", () -> cache.<Map<String, Object>>cached(ticker, "growth", "FMP financial growth", RAW, () -> fmp.growth(ticker)));
            var news = optional(pool, "news", () -> news(ticker));

            List<SourceInfo> sources = new ArrayList<>();
            sources.add(profile.source());
            for (var f : List.of(prices, benchmark, ratios, metrics, growth, news)) {
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
                    dataOr(join(news), List.of()),
                    sources);
        }
    }

    private DiskCache.Result<List<NewsItem>> news(String ticker) {
        String key = props.marketData().finnhubApiKey();
        if (ZenithProperties.isBlank(key) && !props.demoMode()) return null;
        return cache.cached(ticker, "news", "Finnhub news", NEWS, () -> finnhub.news(ticker, key, 14, 12));
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
