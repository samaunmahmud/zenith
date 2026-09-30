package com.zenith.track;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.committee.CommitteeEvent;
import com.zenith.committee.CommitteeResult;
import com.zenith.committee.CommitteeRunner;
import com.zenith.data.PriceBar;
import com.zenith.indicators.Snapshot;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

class SinceServiceTest {

    private static final String AS_OF = "2026-09-25";

    private static PriceBar bar(String date, double close) {
        return new PriceBar(date, close, close, close, close, 1_000);
    }

    /** {@code n} flat closes ending on the ruling's data day, then the given closes on the days after it. */
    private static List<PriceBar> flatThen(int n, double flat, double... after) {
        List<PriceBar> out = new ArrayList<>();
        LocalDate asOf = LocalDate.parse(AS_OF);
        for (int i = n - 1; i >= 0; i--) out.add(bar(asOf.minusDays(i).toString(), flat));
        for (int i = 0; i < after.length; i++) out.add(bar(asOf.plusDays(i + 1).toString(), after[i]));
        return out;
    }

    private static Snapshot.TechnicalsView seen(Double sma50, Double sma200, Double rsi) {
        return new Snapshot.TechnicalsView(null, null, null, null, null, sma50, sma200, rsi, null, null);
    }

    // SPY: 100 on the data day, 101 two closes later (+1%)
    private final List<PriceBar> spy = flatThen(3, 100, 100.5, 101);

    @Test
    void marksTheCallAgainstTheBenchmarkOverTheSameDays() {
        List<PriceBar> stock = flatThen(3, 50, 51, 52); // +4% against SPY +1%
        var s = SinceService.compute("X", "BUY", AS_OF, 50, null, "USD", stock, spy);

        assertThat(s.tradingDays()).isEqualTo(2);
        assertThat(s.latestDate()).isEqualTo("2026-09-27");
        assertThat(s.stockReturn()).isCloseTo(0.04, within(1e-9));
        assertThat(s.spyReturn()).isCloseTo(0.01, within(1e-9));
        assertThat(s.excess()).isCloseTo(0.03, within(1e-9));
        assertThat(s.onTrack()).isTrue();
        assertThat(SinceService.compute("X", "SELL", AS_OF, 50, null, "USD", stock, spy).onTrack()).isFalse();
        assertThat(SinceService.compute("X", "HOLD", AS_OF, 50, null, "USD", stock, spy).onTrack()).isTrue(); // within 5 points
    }

    @Test
    void saysNothingBeforeTheFirstCloseAfterTheRuling() {
        var s = SinceService.compute("X", "BUY", AS_OF, 50, null, "USD", flatThen(3, 50), spy);
        assertThat(s.tradingDays()).isZero();
        assertThat(s.stockReturn()).isNull();
        assertThat(s.onTrack()).isNull();
        assertThat(s.drift()).isEmpty();
    }

    @Test
    void showsTheStocksMoveUnjudgedWhenTheBenchmarkIsMissing() {
        var s = SinceService.compute("X", "BUY", AS_OF, 50, null, "USD", flatThen(3, 50, 55), List.of());
        assertThat(s.stockReturn()).isCloseTo(0.10, within(1e-9));
        assertThat(s.spyReturn()).isNull();
        assertThat(s.onTrack()).isNull();
    }

    @Test
    void notesAnAverageCrossedAndAnRsiLevelReachedSinceTheRuling() {
        // 210 closes at 100, then a fall to 80: below both averages, and RSI at 0 (only losses).
        List<PriceBar> stock = flatThen(210, 100, 90, 80);
        var s = SinceService.compute("X", "BUY", AS_OF, 100, seen(99.0, 99.0, 55.0), "USD", stock, spy);

        assertThat(s.drift()).extracting(SinceService.Drift::label)
                .containsExactly("Close", "RSI (14)", "Against 50-day average", "Against 200-day average");
        assertThat(s.drift().get(0)).isEqualTo(new SinceService.Drift("Close", "$100.00", "$80.00"));
        assertThat(s.drift().get(2).then()).isEqualTo("+1.0%");
        assertThat(s.drift().get(2).now()).startsWith("-");
        assertThat(s.notes()).containsExactly(
                "The price has crossed below its 50-day average since the ruling.",
                "The price has crossed below its 200-day average since the ruling.",
                "RSI has fallen below 30, the usual oversold level.");
    }

    @Test
    void hasNothingToSayWithoutASavedDecisionOrWhenPricesFail() {
        CommitteeRunner none = new CommitteeRunner() {
            @Override
            public CommitteeResult run(String ticker, boolean withRebuttals, Consumer<CommitteeEvent> emit) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Optional<CommitteeResult> lastSavedRun(String ticker) {
                return Optional.empty();
            }
        };
        assertThat(new SinceService(none, t -> List.of()).since("X")).isEmpty();
    }
}
