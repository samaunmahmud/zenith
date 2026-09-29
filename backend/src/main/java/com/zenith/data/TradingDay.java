package com.zenith.data;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * Which price bars are finished trading days.
 *
 * <p>FMP's daily series includes the current session while the market is open, so a fetch during US trading hours
 * ends with a bar whose "close" is really the latest trade. Every indicator treats the last bar as a close, so that
 * partial bar is dropped: a bar dated on the day it was fetched, fetched before the 16:00 New York close, isn't a
 * close yet.
 *
 * <p>Judged from when the data was fetched, not from the current time, so a cache written mid-session stays correct
 * when it's read later. On an early-close day (13:00) a fetch between 13:00 and 16:00 also drops the day: the
 * figures lag by one day until the next fetch, which is the safe way to be wrong.
 */
public final class TradingDay {

    static final ZoneId NEW_YORK = ZoneId.of("America/New_York");
    static final LocalTime CLOSE = LocalTime.of(16, 0);

    private TradingDay() {}

    /** {@code bars} (oldest first) without a trailing bar that was still trading when {@code fetchedAt} was taken. */
    public static List<PriceBar> completed(List<PriceBar> bars, String fetchedAt) {
        if (bars == null || bars.isEmpty()) return bars;
        ZonedDateTime fetched;
        try {
            fetched = Instant.parse(fetchedAt).atZone(NEW_YORK);
        } catch (RuntimeException e) {
            return bars; // no usable timestamp: nothing to judge the last bar by
        }
        PriceBar last = bars.getLast();
        boolean partial = LocalDate.parse(last.date()).equals(fetched.toLocalDate()) && fetched.toLocalTime().isBefore(CLOSE);
        return partial ? bars.subList(0, bars.size() - 1) : bars;
    }
}
