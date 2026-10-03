package com.zenith.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zenith.json.Json;
import com.zenith.support.TestProps;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JavaType;

class DiskCacheTest {

    private static final JavaType STRINGS = Json.MAPPER.getTypeFactory().constructCollectionType(List.class, String.class);

    @TempDir
    Path dir;

    @Test
    void servesFreshCacheWithoutFetchingAgain() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        AtomicInteger fetches = new AtomicInteger();
        cache.cached("AAPL", "x", "X", STRINGS, () -> { fetches.incrementAndGet(); return List.of("a"); });
        var second = cache.<List<String>>cached("AAPL", "x", "X", STRINGS, () -> { fetches.incrementAndGet(); return List.of("b"); });
        assertThat(second.data()).containsExactly("a");
        assertThat(fetches.get()).isEqualTo(1);
        assertThat(Files.exists(dir.resolve("AAPL/x.json"))).isTrue();
    }

    @Test
    void fallsBackToStaleCacheWhenTheLiveFetchFails() {
        new DiskCache(TestProps.create(dir, false, 12)).write("AAPL", "x", List.of("old"));
        DiskCache expired = new DiskCache(TestProps.create(dir, false, 0)); // TTL 0 = everything is stale
        var result = expired.<List<String>>cached("AAPL", "x", "X", STRINGS, () -> { throw new DataException("rate limited"); });
        assertThat(result.data()).containsExactly("old");
        assertThat(result.source().stale()).isTrue();
    }

    private static DiskCache.Provider<List<String>> provider(String label, java.util.function.Supplier<List<String>> fetch) {
        return new DiskCache.Provider<>(label, fetch);
    }

    @Test
    void fallsBackToTheNextProviderWhenThePlanDoesNotCoverTheSymbol() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        var result = cache.<List<String>>cachedFrom("RDDT", "x", STRINGS, List.of(
                provider("FMP", () -> { throw new PlanLimitException("FMP: not covered"); }),
                provider("Tiingo", () -> List.of("bars"))));
        assertThat(result.data()).containsExactly("bars");
        assertThat(result.source().name()).isEqualTo("Tiingo");

        // A later cache hit still credits the provider that actually answered.
        var hit = cache.<List<String>>cachedFrom("RDDT", "x", STRINGS, List.of(
                provider("FMP", () -> { throw new AssertionError("must not fetch"); }),
                provider("Tiingo", () -> { throw new AssertionError("must not fetch"); })));
        assertThat(hit.source().name()).isEqualTo("Tiingo");
    }

    @Test
    void aRealFailureOfTheFirstProviderDoesNotFallBack() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        assertThatThrownBy(() -> cache.<List<String>>cachedFrom("ZZZZQ", "x", STRINGS, List.of(
                provider("FMP", () -> { throw new DataException("Unknown ticker: ZZZZQ", 404); }),
                provider("Tiingo", () -> { throw new AssertionError("must not spend a fallback call on a typo"); }))))
                .isInstanceOf(DataException.class)
                .hasMessageContaining("Unknown ticker");
    }

    @Test
    void reportsThePlanLimitWhenEveryFallbackFails() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        assertThatThrownBy(() -> cache.<List<String>>cachedFrom("QQQ", "x", STRINGS, List.of(
                provider("FMP", () -> { throw new PlanLimitException("FMP: not covered"); }),
                provider("Finnhub", () -> { throw new DataException("Unknown ticker: QQQ", 404); }),
                provider("Tiingo", () -> { throw new DataException("Tiingo is not configured", 503); }))))
                .isInstanceOf(PlanLimitException.class);
    }

    @Test
    void demoModeNeverFetchesAndServesEvenExpiredCache() {
        new DiskCache(TestProps.create(dir, false, 12)).write("AAPL", "x", List.of("cached"));
        DiskCache demo = new DiskCache(TestProps.create(dir, true, 0));
        var hit = demo.<List<String>>cached("AAPL", "x", "X", STRINGS, () -> { throw new AssertionError("must not fetch"); });
        assertThat(hit.data()).containsExactly("cached");

        assertThatThrownBy(() -> demo.cached("MSFT", "x", "X", STRINGS, () -> { throw new AssertionError("must not fetch"); }))
                .isInstanceOf(DataException.class)
                .hasMessageContaining("Demo mode");
    }

    @Test
    void demoModeSuggestsOnlyTickersThatAreActuallyCached() {
        DiskCache demo = new DiskCache(TestProps.create(dir, true, 12));
        assertThatThrownBy(() -> demo.cached("AAPL", "x", "X", STRINGS, List::of))
                .hasMessageContaining("cache is empty")
                .hasMessageContaining("npm run precache");

        demo.write("NVDA", "x", List.of("a"));
        demo.write("JPM", "x", List.of("a"));
        demo.write("TSLA", "other", List.of("a")); // a different file does not count
        assertThatThrownBy(() -> demo.cached("AAPL", "x", "X", STRINGS, List::of))
                .hasMessageEndingWith("Try one of: JPM, NVDA");
    }

    @Test
    void sanitisesTickerForTheFilePath() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        cache.write("../evil", "x", List.of("a"));
        assertThat(Files.exists(dir.resolve(".._EVIL/x.json"))).isTrue();
    }
}
