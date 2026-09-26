package com.zenith.agents;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class NumberCheckTest {

    private final List<Double> allowed = NumberCheck.allowedNumbers(List.of(
            "P/E (TTM): 31.42", "Gross margin (TTM): 46.2%", "Last close: $1,234.50", "1-year return: -12.3%"));

    @Test
    void acceptsNumbersCopiedFromTheInputIncludingRoundedAndUnsignedForms() {
        assertThat(NumberCheck.unsupportedNumbers("P/E of 31.42 and margins of 46.2%", allowed)).isEmpty();
        assertThat(NumberCheck.unsupportedNumbers("a P/E around 31 with 46% gross margin", allowed)).isEmpty();
        assertThat(NumberCheck.unsupportedNumbers("down 12.3% over the year, trading at $1,234.50", allowed)).isEmpty();
    }

    @Test
    void flagsInventedNumbers() {
        assertThat(NumberCheck.unsupportedNumbers("P/E of 35.0 and a price target of $1,500", allowed)).containsExactly("35.0", "1,500");
    }

    @Test
    void flagsOverPreciseNumbersTheInputDoesNotSupport() {
        assertThat(NumberCheck.unsupportedNumbers("P/E of 31.49", allowed)).containsExactly("31.49");
    }

    @Test
    void ignoresIndicatorNamesDatesYearsAndSmallCounts() {
        assertThat(NumberCheck.unsupportedNumbers("SMA200 and RSI (14) since 2026-03-14; 52-week range; 3 risks in 2025", allowed)).isEmpty();
    }
}
