package com.zenith.committee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zenith.config.ZenithProperties.Limits;
import com.zenith.data.DataException;
import com.zenith.llm.LlmException;
import com.zenith.llm.SpendGuard;
import com.zenith.schema.AnalystName;
import com.zenith.schema.Rebuttal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

class CommitteeGateTest {

    private static final Instant NOW = Instant.parse("2026-10-27T12:00:00Z");

    /** A mutable clock, so a test can move time forward. */
    private static final class TestClock extends Clock {
        Instant now = NOW;

        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    /** Fake committee: counts live runs and serves whatever was "saved" for a ticker. */
    private static final class FakeCommittee implements CommitteeRunner {
        final AtomicInteger liveRuns = new AtomicInteger();
        final Map<String, CommitteeResult> saved = new HashMap<>();
        RuntimeException failWith;
        CountDownLatch holdRun; // when set, live runs block until released

        @Override
        public CommitteeResult run(String ticker, boolean withRebuttals, Consumer<CommitteeEvent> emit) {
            liveRuns.incrementAndGet();
            if (holdRun != null) {
                try { holdRun.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            if (failWith != null) throw failWith;
            return result(ticker, NOW, withRebuttals);
        }

        @Override
        public Optional<CommitteeResult> lastSavedRun(String ticker) {
            return Optional.ofNullable(saved.get(ticker)).map(r -> r.asReplay(CommitteeGate.FALLBACK));
        }
    }

    private static CommitteeResult result(String ticker, Instant at, boolean withRebuttals) {
        List<Rebuttal> rebuttals = withRebuttals
                ? List.of(new Rebuttal(AnalystName.RISK, AnalystName.FUNDAMENTALS, "Too volatile.", false))
                : List.of();
        return new CommitteeResult(ticker, at.toString(), null, List.of(), List.of(), null, List.of(), List.of(),
                rebuttals, null, null, "", null, List.of(), List.of(), false, null);
    }

    private final FakeCommittee committee = new FakeCommittee();
    private final TestClock clock = new TestClock();

    private CommitteeGate gate(double reuseHours, int perHour, int concurrent) {
        return new CommitteeGate(committee, new Limits(reuseHours, perHour, concurrent, 0), clock);
    }

    @Test
    void servesARecentDecisionInsteadOfPayingForANewOne() {
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofHours(2)), false));
        CommitteeResult r = gate(6, 20, 2).run("AAPL", false, e -> {});
        assertThat(r.replayed()).isTrue();
        assertThat(r.replayReason()).isEqualTo(CommitteeGate.RECENT);
        assertThat(committee.liveRuns).hasValue(0);
    }

    @Test
    void runsLiveOnceTheSavedDecisionIsOlderThanTheReuseWindow() {
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofHours(7)), false));
        CommitteeResult r = gate(6, 20, 2).run("AAPL", false, e -> {});
        assertThat(r.replayed()).isFalse();
        assertThat(committee.liveRuns).hasValue(1);
    }

    @Test
    void doesNotReuseARunWithoutRebuttalsWhenRebuttalsWereAskedFor() {
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofMinutes(10)), false));
        CommitteeResult r = gate(6, 20, 2).run("AAPL", true, e -> {});
        assertThat(r.replayed()).isFalse();
        assertThat(committee.liveRuns).hasValue(1);
    }

    @Test
    void reuseHoursOfZeroAlwaysRunsLive() {
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofMinutes(1)), false));
        gate(0, 20, 2).run("AAPL", false, e -> {});
        assertThat(committee.liveRuns).hasValue(1);
    }

    @Test
    void capsLiveRunsPerRollingHour() {
        CommitteeGate gate = gate(0, 2, 5);
        gate.run("A", false, e -> {});
        gate.run("B", false, e -> {});
        assertThatThrownBy(() -> gate.run("C", false, e -> {}))
                .isInstanceOf(CommitteeGate.BusyException.class)
                .hasMessageContaining("2 live sessions");

        committee.saved.put("C", result("C", NOW.minus(Duration.ofDays(3)), false));
        assertThat(gate.run("C", false, e -> {}).replayReason()).isEqualTo(CommitteeGate.BUSY);
        assertThat(committee.liveRuns).hasValue(2);

        clock.now = NOW.plus(Duration.ofMinutes(61)); // the window slides: both earlier runs have expired
        assertThat(gate.run("D", false, e -> {}).replayed()).isFalse();
        assertThat(committee.liveRuns).hasValue(3);
    }

    @Test
    void refusesARunWhileTheConcurrencyLimitIsTaken() throws Exception {
        CommitteeGate gate = gate(0, 0, 1);
        committee.holdRun = new CountDownLatch(1);
        Thread first = Thread.startVirtualThread(() -> gate.run("A", false, e -> {}));
        while (committee.liveRuns.get() == 0) Thread.onSpinWait(); // wait until the first run holds the permit

        assertThatThrownBy(() -> gate.run("B", false, e -> {}))
                .isInstanceOf(CommitteeGate.BusyException.class)
                .hasMessageContaining("already in session");

        committee.holdRun.countDown();
        first.join();
        committee.holdRun = null;
        assertThat(gate.run("B", false, e -> {}).replayed()).isFalse(); // permit released
    }

    @Test
    void fallsBackToTheSavedDecisionWhenALiveRunFailsAndReleasesThePermit() {
        CommitteeGate gate = gate(0, 0, 1);
        committee.failWith = new IllegalStateException("Token Factory down");
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofDays(2)), false));

        CommitteeResult r = gate.run("AAPL", false, e -> {});
        assertThat(r.replayReason()).isEqualTo(CommitteeGate.FALLBACK);

        // Without a saved run the failure surfaces, and the single permit must still be free afterwards.
        assertThatThrownBy(() -> gate.run("MSFT", false, e -> {})).hasMessageContaining("Token Factory down");
        committee.failWith = null;
        assertThat(gate.run("MSFT", false, e -> {}).replayed()).isFalse();
    }

    @Test
    void runsThatFailBeforeAnyModelCallDoNotUseUpTheHourlyQuota() {
        CommitteeGate gate = gate(0, 1, 1);
        committee.failWith = new DataException("Unknown ticker", 404);
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> gate.run("NOPE", false, e -> {})).isInstanceOf(DataException.class);
        }
        committee.failWith = null;
        assertThat(gate.run("AAPL", false, e -> {}).replayed()).isFalse(); // the single slot is still free
    }

    @Test
    void aRunThatFailsAfterSpendingStillCountsAgainstTheHour() {
        CommitteeGate gate = gate(0, 1, 1);
        committee.failWith = new IllegalStateException("Chair timed out");
        assertThatThrownBy(() -> gate.run("AAPL", false, e -> {})).hasMessageContaining("Chair timed out");
        committee.failWith = null;
        assertThatThrownBy(() -> gate.run("MSFT", false, e -> {})).isInstanceOf(CommitteeGate.BusyException.class);
    }

    @Test
    void aSpentOrSwitchedOffBudgetDoesNotUseUpTheHourlyQuota() {
        CommitteeGate gate = gate(0, 1, 1);
        committee.failWith = new SpendGuard.BudgetExceededException("MAX_SPEND_USD is 0");
        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> gate.run("AAPL", false, e -> {})).isInstanceOf(SpendGuard.BudgetExceededException.class);
        }
        committee.failWith = new LlmException("wrapped", "news", new SpendGuard.BudgetExceededException("cap reached"));
        assertThatThrownBy(() -> gate.run("AAPL", false, e -> {})).isInstanceOf(LlmException.class);
        committee.failWith = null;
        assertThat(gate.run("AAPL", false, e -> {}).replayed()).isFalse();
    }

    @Test
    void aCancelledRunIsNotReplacedByASavedOne() {
        committee.saved.put("AAPL", result("AAPL", NOW.minus(Duration.ofDays(2)), false));
        committee.failWith = new java.util.concurrent.CancellationException("Client disconnected");
        assertThatThrownBy(() -> gate(0, 0, 1).run("AAPL", false, e -> {}))
                .isInstanceOf(java.util.concurrent.CancellationException.class);
    }
}
