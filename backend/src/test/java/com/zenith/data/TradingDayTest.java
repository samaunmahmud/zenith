package com.zenith.data;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TradingDayTest {

    private static final List<PriceBar> BARS = List.of(
            new PriceBar("2026-09-28", 0, 0, 0, 100, 0),
            new PriceBar("2026-09-29", 0, 0, 0, 101, 0));

    @Test
    void dropsTodaysBarWhenFetchedDuringTheSession() {
        // 17:57 UTC = 13:57 in New York (EDT): the market is still open.
        assertThat(TradingDay.completed(BARS, "2026-09-29T17:57:27Z")).extracting(PriceBar::date).containsExactly("2026-09-28");
    }

    @Test
    void keepsTodaysBarOnceTheMarketHasClosed() {
        // 20:00 UTC = 16:00 in New York: the close.
        assertThat(TradingDay.completed(BARS, "2026-09-29T20:00:00Z")).hasSize(2);
        assertThat(TradingDay.completed(BARS, "2026-09-29T23:30:00Z")).hasSize(2);
    }

    @Test
    void keepsTheLastBarWhenItIsFromAnEarlierDay() {
        // Fetched before the open on the 30th: the 29th is complete.
        assertThat(TradingDay.completed(BARS, "2026-09-30T12:00:00Z")).hasSize(2);
    }

    @Test
    void usesNewYorkDatesNotUtc() {
        // 02:00 UTC on the 30th is still the evening of the 29th in New York, after that day's close.
        assertThat(TradingDay.completed(BARS, "2026-09-30T02:00:00Z")).hasSize(2);
        // Winter (EST, UTC-5): 20:30 UTC is 15:30 in New York, before the close.
        List<PriceBar> winter = List.of(new PriceBar("2026-12-01", 0, 0, 0, 1, 0), new PriceBar("2026-12-02", 0, 0, 0, 1, 0));
        assertThat(TradingDay.completed(winter, "2026-12-02T20:30:00Z")).hasSize(1);
    }

    @Test
    void leavesBarsAloneWithoutAUsableTimestamp() {
        assertThat(TradingDay.completed(BARS, null)).hasSize(2);
        assertThat(TradingDay.completed(BARS, "yesterday")).hasSize(2);
        assertThat(TradingDay.completed(List.of(), "2026-09-29T17:57:27Z")).isEmpty();
    }
}
