package com.zenith.indicators;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.data.PriceBar;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class TriggersTest {

    private static final String AS_OF = "2026-09-25";

    private static Snapshot.TechnicalsView seen(Double sma50, Double sma200, Double rsi, Technicals.Range52w range) {
        return new Snapshot.TechnicalsView(null, null, null, null, null, sma50, sma200, rsi, null, range);
    }

    /** {@code n} flat closes ending on the ruling's data day, then the given closes on the days after it. */
    private static List<PriceBar> flatThen(int n, double flat, double... after) {
        List<PriceBar> out = new ArrayList<>();
        LocalDate asOf = LocalDate.parse(AS_OF);
        for (int i = n - 1; i >= 0; i--) out.add(bar(asOf.minusDays(i).toString(), flat));
        for (int i = 0; i < after.length; i++) out.add(bar(asOf.plusDays(i + 1).toString(), after[i]));
        return out;
    }

    private static PriceBar bar(String date, double close) {
        return new PriceBar(date, close, close, close, close, 1_000);
    }

    @Test
    void offersOnlyConditionsThatArentAlreadyTrue() {
        // Below both averages, RSI mid-range: the crossings offered are upward, and both RSI levels are open.
        var menu = Triggers.menu(90, seen(100.0, 110.0, 50.0, new Technicals.Range52w(150, 80, 0, 0)), "USD");
        assertThat(menu).extracting(Triggers.Trigger::id).containsExactly(
                "above-200d", "above-50d", "rsi-above-70", "rsi-below-30", "up-15", "down-15", "beats-spy-10", "trails-spy-10", "new-high", "new-low");
        assertThat(menu.get(0).condition()).contains("$110.00");
        assertThat(menu.get(4).condition()).contains("$103.50"); // 90 × 1.15, computed here, not by the model

        // Above both averages and already overbought: downward crossings, and no "rises above 70".
        var hot = Triggers.menu(120, seen(100.0, 110.0, 75.0, null), "USD");
        assertThat(hot).extracting(Triggers.Trigger::id).containsExactly(
                "below-200d", "below-50d", "rsi-below-30", "up-15", "down-15", "beats-spy-10", "trails-spy-10");
    }

    @Test
    void findsTheFirstCloseThatMetTheCondition() {
        List<PriceBar> stock = flatThen(210, 100, 95, 84, 90);
        List<PriceBar> spy = flatThen(210, 100, 100, 100, 100);
        var then = seen(100.0, 100.0, 50.0, new Technicals.Range52w(120, 85, 0, 0));

        var down = Triggers.check("down-15", AS_OF, 100, then, stock, spy).orElseThrow();
        assertThat(down.metOn()).isEqualTo("2026-09-27"); // 84 ≤ 85
        assertThat(down.now()).isEqualTo("-10.0% since the ruling");

        assertThat(Triggers.check("new-low", AS_OF, 100, then, stock, spy).orElseThrow().metOn()).isEqualTo("2026-09-27");
        assertThat(Triggers.check("below-200d", AS_OF, 100, then, stock, spy).orElseThrow().metOn()).isEqualTo("2026-09-26");
        assertThat(Triggers.check("up-15", AS_OF, 100, then, stock, spy).orElseThrow().metOn()).isNull();

        var trails = Triggers.check("trails-spy-10", AS_OF, 100, then, stock, spy).orElseThrow();
        assertThat(trails.metOn()).isEqualTo("2026-09-27"); // −16 points
        assertThat(trails.now()).isEqualTo("-10.0 points against the S&P 500");
    }

    @Test
    void saysSoBeforeAnyCloseAndIgnoresUnknownIds() {
        List<PriceBar> stock = flatThen(30, 100);
        assertThat(Triggers.check("up-15", AS_OF, 100, null, stock, stock).orElseThrow().now()).isEqualTo("no close since the ruling yet");
        assertThat(Triggers.check("moon", AS_OF, 100, null, flatThen(30, 100, 101), stock)).isEmpty();
    }
}
