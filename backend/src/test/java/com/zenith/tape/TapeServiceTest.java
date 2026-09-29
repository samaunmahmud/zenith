package com.zenith.tape;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.data.CompanyProfile;
import com.zenith.data.DiskCache;
import com.zenith.data.PriceBar;
import com.zenith.config.ZenithProperties;
import com.zenith.track.DecisionLedger;
import com.zenith.track.TrackedCall;
import com.zenith.support.TestProps;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TapeServiceTest {

    @TempDir Path dir;

    private static List<PriceBar> bars(int n) {
        return IntStream.range(0, n).mapToObj(i -> new PriceBar("2026-08-%02d".formatted(i % 28 + 1), 0, 0, 0, 100 + i, 0)).toList();
    }

    private static TrackedCall call(String ticker, String call, String at) {
        return new TrackedCall(ticker + at, ticker, ticker + " Inc", at, "2026-09-25", call, 0.6, "3-6 months", 100);
    }

    @Test
    void readsLastCloseChangeSparkAndLatestCallFromTheCache() {
        ZenithProperties props = TestProps.create(dir, false, 12); // on file: AAPL, NVDA
        DiskCache cache = new DiskCache(props);
        cache.write("AAPL", "prices", bars(40));
        cache.write("AAPL", "profile", new CompanyProfile("AAPL", "Apple Inc.", null, null, null, null, null, null, null));
        TapeService tape = new TapeService(cache, new DecisionLedger(props), props);

        var row = tape.row("AAPL", List.of(call("AAPL", "BUY", "2026-09-20T10:00:00Z"), call("NVDA", "SELL", "2026-09-21T10:00:00Z"),
                call("AAPL", "HOLD", "2026-09-26T10:00:00Z"))).orElseThrow();

        assertThat(row.company()).isEqualTo("Apple Inc.");
        assertThat(row.close()).isEqualTo(139);
        assertThat(row.change()).isCloseTo(139.0 / 138 - 1, within(1e-12));
        assertThat(row.spark()).hasSize(TapeService.SPARK_DAYS).endsWith(139.0);
        assertThat(row.lastCall().call()).isEqualTo("HOLD"); // the latest, not the first
    }

    @Test
    void skipsTickersWithNoCachedPricesAndNeverFetches() {
        ZenithProperties props = TestProps.create(dir, false, 12);
        DiskCache cache = new DiskCache(props);
        cache.write("NVDA", "prices", bars(1));
        TapeService tape = new TapeService(cache, new DecisionLedger(props), props);

        var rows = tape.rows();
        assertThat(rows).extracting(TapeService.Row::ticker).containsExactly("NVDA"); // AAPL has no cache: left out
        assertThat(rows.get(0).change()).isNull(); // one close: no change to report
        assertThat(rows.get(0).company()).isEqualTo("NVDA");
        assertThat(rows.get(0).lastCall()).isNull();
    }
}
