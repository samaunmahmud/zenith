package com.zenith.indicators;

import static org.assertj.core.api.Assertions.assertThat;

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
