package com.zenith.indicators;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.data.PriceBar;
import java.util.List;
import org.junit.jupiter.api.Test;

class RiskTest {

    @Test
    void stdevUsesTheSampleDefinition() {
        // mean 5, squared deviations sum = 32, /7 → sqrt(32/7)
        assertThat(Risk.stdev(new double[] {2, 4, 4, 4, 5, 5, 7, 9})).isCloseTo(Math.sqrt(32.0 / 7), within(1e-12));
    }

    @Test
    void volatilityIsZeroWhenEveryDailyReturnIsIdentical() {
        double[] closes = new double[40];
        for (int i = 0; i < 40; i++) closes[i] = 100 * Math.pow(1.01, i);
        assertThat(Risk.annualisedVolatility(closes)).isCloseTo(0, within(1e-12));
    }

    @Test
    void volatilityMatchesTheClosedFormForAlternatingLogReturns() {
        double a = 0.02;
        int n = 30; // number of returns (even, so the mean is exactly 0)
        double[] closes = new double[n + 1];
        closes[0] = 100;
        for (int i = 0; i < n; i++) closes[i + 1] = closes[i] * Math.exp(i % 2 == 0 ? a : -a);
        double expected = Math.sqrt(n * a * a / (n - 1)) * Math.sqrt(252);
        assertThat(Risk.annualisedVolatility(closes)).isCloseTo(expected, within(1e-10));
        assertThat(Risk.annualisedVolatility(new double[] {100, 101, 102})).isNull();
    }

    @Test
    void maxDrawdownFindsTheLargestPeakToTroughFallAndItsDates() {
        Risk.Drawdown d = Risk.maxDrawdown(Bars.fromCloses(100, 120, 60, 90, 130, 117));
        assertThat(d.maxDrawdown()).isCloseTo(-0.5, within(1e-12));
        assertThat(d.peakDate()).isEqualTo("2026-01-02");
        assertThat(d.troughDate()).isEqualTo("2026-01-03");
        assertThat(Risk.maxDrawdown(Bars.fromCloses(1, 2, 3, 4)).maxDrawdown()).isEqualTo(0);
    }

    private static double[][] benchAndDoubleBeta() {
        double[] bench = new double[41];
        double[] asset = new double[41];
        bench[0] = 100;
        asset[0] = 50;
        for (int i = 0; i < 40; i++) {
            double r = Math.sin(i) * 0.01;
            bench[i + 1] = bench[i] * (1 + r);
            asset[i + 1] = asset[i] * (1 + 2 * r); // exactly twice the benchmark's daily return
        }
        return new double[][] {bench, asset};
    }

    @Test
    void betaIsTwoWhenReturnsAreExactlyDoubleAndOneAgainstItself() {
        double[][] s = benchAndDoubleBeta();
        assertThat(Risk.beta(Bars.fromCloses(s[1]), Bars.fromCloses(s[0]))).isCloseTo(2, within(1e-10));
        assertThat(Risk.beta(Bars.fromCloses(s[0]), Bars.fromCloses(s[0]))).isCloseTo(1, within(1e-10));
    }

    @Test
    void betaAlignsOnSharedDatesOnly() {
        double[][] s = benchAndDoubleBeta();
        List<PriceBar> bench = Bars.fromCloses(s[0]);
        // Drop the last benchmark day: that asset day must be ignored, not misaligned.
        assertThat(Risk.beta(Bars.fromCloses(s[1]), bench.subList(0, bench.size() - 1))).isCloseTo(2, within(1e-10));
    }

    @Test
    void liquidityAveragesVolumeAndDollarVolume() {
        Risk.Liquidity l = Risk.liquidity(Bars.fromCloses(new double[] {10, 20}, 100), 20);
        assertThat(l.avgVolume20d()).isEqualTo(100);
        assertThat(l.avgDollarVolume20d()).isEqualTo(1_500); // (10*100 + 20*100) / 2
    }
}
