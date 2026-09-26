package com.zenith.indicators;

import com.zenith.data.PriceBar;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Test helper: builds daily bars with consecutive dates. */
final class Bars {

    private Bars() {}

    static List<PriceBar> fromCloses(double[] closes, double volume) {
        List<PriceBar> out = new ArrayList<>();
        LocalDate d = LocalDate.of(2026, 1, 1);
        for (int i = 0; i < closes.length; i++) {
            out.add(new PriceBar(d.plusDays(i).toString(), closes[i], closes[i], closes[i], closes[i], volume));
        }
        return out;
    }

    static List<PriceBar> fromCloses(double... closes) {
        return fromCloses(closes, 1_000);
    }
}
