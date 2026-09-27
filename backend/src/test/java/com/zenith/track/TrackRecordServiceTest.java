package com.zenith.track;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.data.PriceBar;
import java.util.List;
import org.junit.jupiter.api.Test;

class TrackRecordServiceTest {

    private static PriceBar bar(String date, double close) {
        return new PriceBar(date, close, close, close, close, 1_000);
    }

    private static TrackedCall call(String call, double entry) {
        return new TrackedCall("X@t", "X", "X Corp", "2026-09-01T12:00:00Z", "2026-09-01", call, 0.7, "3-6 months", entry);
    }

    // SPY: 100 → 102 by the 7-day exit (+2%)
    private final List<PriceBar> spy = List.of(bar("2026-08-31", 99), bar("2026-09-01", 100), bar("2026-09-08", 102));

    @Test
    void measuresFromTheDataDayToTheFirstCloseOnOrAfterTheDueDate() {
        // 2026-09-08 is the due date (asOf + 7) and a trading day
        TrackRecordService.Outcome o = TrackRecordService.score(call("BUY", 50), List.of(bar("2026-09-01", 50), bar("2026-09-08", 55)), spy, 7);
        assertThat(o.status()).isEqualTo("scored");
        assertThat(o.exitDate()).isEqualTo("2026-09-08");
        assertThat(o.stockReturn()).isCloseTo(0.10, within(1e-9));
        assertThat(o.spyReturn()).isCloseTo(0.02, within(1e-9));
        assertThat(o.excess()).isCloseTo(0.08, within(1e-9));
        assertThat(o.correct()).isTrue();
    }

    @Test
    void judgesEachCallAgainstTheMarketNotInIsolation() {
        List<PriceBar> upOnePct = List.of(bar("2026-09-08", 50.5)); // +1%, but SPY did +2%
        assertThat(TrackRecordService.score(call("BUY", 50), upOnePct, spy, 7).correct()).isFalse();
        assertThat(TrackRecordService.score(call("SELL", 50), upOnePct, spy, 7).correct()).isTrue();
        assertThat(TrackRecordService.score(call("HOLD", 50), upOnePct, spy, 7).correct()).isTrue(); // within 5 points

        List<PriceBar> upTwentyPct = List.of(bar("2026-09-08", 60));
        assertThat(TrackRecordService.score(call("HOLD", 50), upTwentyPct, spy, 7).correct()).isFalse();
    }

    @Test
    void staysPendingUntilTheWindowHasAClose() {
        TrackRecordService.Outcome o = TrackRecordService.score(call("BUY", 50), List.of(bar("2026-09-05", 51)), spy, 30);
        assertThat(o.status()).isEqualTo("pending");
        assertThat(o.dueDate()).isEqualTo("2026-10-01");
        assertThat(o.correct()).isNull();
    }

    @Test
    void summarisesWinRateAndTheEdgeOfFollowingTheCalls() {
        List<PriceBar> stock = List.of(bar("2026-09-08", 45)); // −10% vs SPY +2% → excess −12%
        var buy = new TrackRecordService.ScoredCall(call("BUY", 50), List.of(TrackRecordService.score(call("BUY", 50), stock, spy, 7)));
        var sell = new TrackRecordService.ScoredCall(call("SELL", 50), List.of(TrackRecordService.score(call("SELL", 50), stock, spy, 7)));
        var s7 = TrackRecordService.summarise(List.of(buy, sell)).get(0);
        assertThat(s7.days()).isEqualTo(7);
        assertThat(s7.scored()).isEqualTo(2);
        assertThat(s7.correct()).isEqualTo(1); // the SELL
        assertThat(s7.winRate()).isEqualTo(0.5);
        assertThat(s7.avgEdge()).isCloseTo(0.0, within(1e-9)); // BUY lost 12 points, SELL avoided 12

        var s90 = TrackRecordService.summarise(List.of(buy, sell)).get(2);
        assertThat(s90.winRate()).isNull(); // nothing scored yet: no rate, rather than a made-up 0%
    }
}
