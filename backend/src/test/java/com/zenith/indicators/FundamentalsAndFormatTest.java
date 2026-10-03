package com.zenith.indicators;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class FundamentalsAndFormatTest {

    @Test
    void pickNumberReturnsTheFirstFiniteNumberAcrossFallbackKeys() {
        Map<String, Object> m = new HashMap<>();
        m.put("a", null);
        m.put("b", 3.5);
        assertThat(Fundamentals.pickNumber(m, "a", "b")).isEqualTo(3.5);
        assertThat(Fundamentals.pickNumber(Map.of("a", "2.5"), "a")).isEqualTo(2.5);
        assertThat(Fundamentals.pickNumber(Map.of("a", "n/a", "b", Double.POSITIVE_INFINITY), "a", "b")).isNull();
    }

    @Test
    void mapsCurrentAndLegacyFmpFieldNames() {
        var m = Fundamentals.metrics(Map.of("peRatioTTM", 30, "grossProfitMarginTTM", 0.45), Map.of("roeTTM", 1.5), Map.of("epsgrowth", 0.1));
        assertThat(m.peRatio()).isEqualTo(30.0);
        assertThat(m.grossMargin()).isEqualTo(0.45);
        assertThat(m.returnOnEquity()).isEqualTo(1.5);
        assertThat(m.epsGrowth()).isEqualTo(0.1);
        assertThat(m.debtToEquity()).isNull();
    }

    @Test
    void fallsBackToFinnhubFieldByFieldConvertingPercentages() {
        Map<String, Object> finnhub = Map.of("peTTM", 99.0, "grossMarginTTM", 48.65, "roeTTM", 137.18,
                "pfcfShareTTM", 25.0, "forwardPE", 35.34, "revenueGrowthTTMYoy", 14.24, "epsGrowthTTMYoy", -3.5);
        var m = Fundamentals.metrics(Map.of("priceToEarningsRatioTTM", 30), Map.of(), Map.of(), finnhub);
        assertThat(m.peRatio()).isEqualTo(30.0); // FMP wins when it has the field
        assertThat(m.grossMargin()).isCloseTo(0.4865, within(1e-9));
        assertThat(m.returnOnEquity()).isCloseTo(1.3718, within(1e-9));
        assertThat(m.freeCashFlowYield()).isCloseTo(0.04, within(1e-9)); // 1 / (price / FCF)
        assertThat(m.forwardPe()).isEqualTo(35.34);
        assertThat(m.revenueGrowth()).isCloseTo(0.1424, within(1e-9));
        assertThat(m.epsGrowth()).isCloseTo(-0.035, within(1e-9));
        assertThat(m.growthTtm()).isTrue();
    }

    @Test
    void keepsFmpFiscalYearGrowthOverFinnhubTtm() {
        var m = Fundamentals.metrics(Map.of(), Map.of(), Map.of("revenueGrowth", 0.08), Map.of("revenueGrowthTTMYoy", 14.0, "epsGrowthTTMYoy", 9.0));
        assertThat(m.revenueGrowth()).isEqualTo(0.08);
        assertThat(m.epsGrowth()).isNull(); // not mixed with Finnhub's TTM basis
        assertThat(m.growthTtm()).isFalse();
    }

    @Test
    void formatsPercentagesCompactNumbersAndMoney() {
        assertThat(Format.pct(0.1234)).isEqualTo("12.3%");
        assertThat(Format.signedPct(0.05)).isEqualTo("+5.0%");
        assertThat(Format.signedPct(-0.05)).isEqualTo("-5.0%");
        assertThat(Format.pct(null)).isEqualTo("not available");
        assertThat(Format.compact(2_950_000_000_000.0)).isEqualTo("2.95T");
        assertThat(Format.compact(52_300_000.0)).isEqualTo("52.30M");
        assertThat(Format.money(182.5, "USD")).isEqualTo("$182.50");
        assertThat(Format.money(1_500_000_000.0, "EUR", true)).isEqualTo("1.50B EUR");
    }
}
