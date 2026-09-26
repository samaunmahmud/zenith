package com.zenith.indicators;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.data.PriceBar;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class TechnicalsTest {

    private static final double EPS = 1e-9;

    private static double[] series(int n, java.util.function.IntToDoubleFunction f) {
        return IntStream.range(0, n).mapToDouble(f).toArray();
    }

    @Test
    void periodReturnComputesTheSimpleReturnOverNSessions() {
        assertThat(Technicals.periodReturn(new double[] {100, 105, 110}, 2)).isCloseTo(0.1, within(EPS));
        assertThat(Technicals.periodReturn(new double[] {100, 105, 110}, 1)).isCloseTo(110.0 / 105 - 1, within(EPS));
        assertThat(Technicals.periodReturn(new double[] {100, 110}, 2)).isNull();
    }

    @Test
    void smaAveragesTheLastNValues() {
        assertThat(Technicals.sma(new double[] {1, 2, 3, 4, 5}, 3)).isEqualTo(4.0);
        assertThat(Technicals.sma(new double[] {1, 2, 3, 4, 5}, 5)).isEqualTo(3.0);
        assertThat(Technicals.sma(new double[] {1, 2}, 3)).isNull();
    }

    @Test
    void emaSeedsWithTheSmaThenAppliesK() {
        // period 3 → k = 0.5; seed = mean(1,2,3) = 2; then 0.5*4 + 0.5*2 = 3; then 0.5*5 + 0.5*3 = 4
        assertThat(Technicals.emaSeries(new double[] {1, 2, 3, 4, 5}, 3)).containsExactly(null, null, 2.0, 3.0, 4.0);
    }

    @Test
    void rsiMatchesAHandComputedValue() {
        // period 2, changes +1, -1, +1: seed avgGain = avgLoss = 0.5;
        // next: avgGain = (0.5 + 1)/2 = 0.75, avgLoss = (0.5 + 0)/2 = 0.25 → RS = 3 → RSI = 75
        assertThat(Technicals.rsi(new double[] {1, 2, 1, 2}, 2)).isCloseTo(75, within(EPS));
    }

    @Test
    void rsiIsHundredWhenOnlyRisingFiftyWhenFlatZeroWhenOnlyFalling() {
        assertThat(Technicals.rsi(series(30, i -> 100 + i), 14)).isEqualTo(100.0);
        assertThat(Technicals.rsi(series(30, i -> 100), 14)).isEqualTo(50.0);
        assertThat(Technicals.rsi(series(30, i -> 100 - i), 14)).isCloseTo(0, within(EPS));
        assertThat(Technicals.rsi(new double[] {1, 2, 3}, 14)).isNull();
    }

    @Test
    void macdIsZeroOnAFlatSeries() {
        Technicals.Macd m = Technicals.macd(series(60, i -> 50));
        assertThat(m.macd()).isCloseTo(0, within(EPS));
        assertThat(m.signal()).isCloseTo(0, within(EPS));
        assertThat(m.histogram()).isCloseTo(0, within(EPS));
    }

    @Test
    void macdEqualsTheEmaLagDifferenceOnALinearSeries() {
        // On x_t = t an SMA-seeded EMA lags by exactly (n-1)/2, so MACD = 12.5 - 5.5 = 7.
        Technicals.Macd m = Technicals.macd(series(100, i -> i));
        assertThat(m.macd()).isCloseTo(7, within(1e-6));
        assertThat(m.signal()).isCloseTo(7, within(1e-6));
        assertThat(m.histogram()).isCloseTo(0, within(1e-6));
        assertThat(Technicals.macd(new double[] {1, 2, 3})).isNull();
    }

    @Test
    void range52wUsesIntradayHighsAndLows() {
        List<PriceBar> bars = List.of(
                new PriceBar("2026-01-01", 100, 120, 90, 100, 1),
                new PriceBar("2026-01-02", 110, 115, 80, 110, 1),
                new PriceBar("2026-01-03", 96, 100, 95, 96, 1));
        Technicals.Range52w r = Technicals.range52w(bars);
        assertThat(r.high()).isEqualTo(120);
        assertThat(r.low()).isEqualTo(80);
        assertThat(r.pctFromHigh()).isCloseTo(96.0 / 120 - 1, within(EPS)); // -20%
        assertThat(r.pctFromLow()).isCloseTo(96.0 / 80 - 1, within(EPS)); // +20%
    }
}
