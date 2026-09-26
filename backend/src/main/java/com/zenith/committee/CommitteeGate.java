package com.zenith.committee;

import com.zenith.config.ZenithProperties;
import com.zenith.data.DataException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Decides whether a request gets a live (paid) committee run or a saved decision.
 * The spending cap stops total spend; this spreads it out, so one burst of visitors to a public demo
 * can't use up the whole budget in minutes:
 * <ol>
 *   <li>a decision younger than {@code reuseHours} is served again instead of paying for a new one;</li>
 *   <li>at most {@code maxConcurrentRuns} live runs at once, and {@code liveRunsPerHour} per rolling hour;</li>
 *   <li>if a live run fails, the last saved decision is served (the demo never shows a blank screen).</li>
 * </ol>
 * Every saved decision served is flagged with its reason, so the UI can say exactly what the visitor is seeing.
 */
@Component
public class CommitteeGate {

    public static final String RECENT = "recent";
    public static final String BUSY = "busy";
    public static final String FALLBACK = "fallback";

    private static final Logger log = LoggerFactory.getLogger(CommitteeGate.class);

    /** No live run possible right now and nothing saved to show instead (HTTP 429). */
    public static class BusyException extends RuntimeException {
        public BusyException(String message) {
            super(message);
        }
    }

    private final CommitteeRunner committee;
    private final ZenithProperties.Limits limits;
    private final Clock clock;
    private final Semaphore running;
    private final Deque<Instant> liveStarts = new ArrayDeque<>();

    @Autowired
    public CommitteeGate(CommitteeRunner committee, ZenithProperties props) {
        this(committee, props.limits() == null ? ZenithProperties.Limits.NONE : props.limits(), Clock.systemUTC());
    }

    CommitteeGate(CommitteeRunner committee, ZenithProperties.Limits limits, Clock clock) {
        this.committee = committee;
        this.limits = limits;
        this.clock = clock;
        this.running = new Semaphore(Math.max(1, limits.maxConcurrentRuns()));
    }

    public CommitteeResult run(String ticker, boolean rebuttals, Consumer<CommitteeEvent> emit) {
        Optional<CommitteeResult> saved = committee.lastSavedRun(ticker);

        // A saved run without rebuttals can't answer a request that asked for them.
        Optional<CommitteeResult> reusable = saved.filter(r -> isRecent(r) && (!rebuttals || !r.rebuttals().isEmpty()));
        if (reusable.isPresent()) {
            log.info("Serving {}'s decision from {} (younger than {}h)", ticker, reusable.get().generatedAt(), limits.reuseHours());
            return reusable.get().asReplay(RECENT);
        }

        if (!running.tryAcquire()) {
            return busy(ticker, saved, "The committee is already in session for other visitors. Try again in a minute.");
        }
        try {
            Instant slot = takeHourlySlot();
            if (slot == null) {
                return busy(ticker, saved, "The committee has held its " + limits.liveRunsPerHour()
                        + " live sessions for this hour. Try again later, or pick one of the demo tickers.");
            }
            try {
                return committee.run(ticker, rebuttals, emit);
            } catch (RuntimeException e) {
                // These fail before any model call, so they cost nothing and shouldn't use up the hour's quota;
                // otherwise a string of unknown tickers could lock real visitors out for free.
                if (e instanceof DataException || e instanceof CommitteeService.NotConfiguredException) releaseHourlySlot(slot);
                if (saved.isPresent()) {
                    log.warn("Live run failed for {}, replaying last saved run: {}", ticker, e.getMessage());
                    return saved.get().asReplay(FALLBACK);
                }
                throw e;
            }
        } finally {
            running.release();
        }
    }

    private CommitteeResult busy(String ticker, Optional<CommitteeResult> saved, String message) {
        log.info("No live run for {}: {}", ticker, message);
        return saved.map(r -> r.asReplay(BUSY)).orElseThrow(() -> new BusyException(message));
    }

    private boolean isRecent(CommitteeResult r) {
        if (limits.reuseHours() <= 0 || r.generatedAt() == null) return false;
        try {
            Duration age = Duration.between(Instant.parse(r.generatedAt()), clock.instant());
            return !age.isNegative() && age.toMinutes() < limits.reuseHours() * 60;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Sliding one-hour window of live-run start times. Returns the slot taken, or null if the hour is full. */
    private synchronized Instant takeHourlySlot() {
        Instant now = clock.instant();
        if (limits.liveRunsPerHour() <= 0) return now;
        while (!liveStarts.isEmpty() && liveStarts.peekFirst().isBefore(now.minus(Duration.ofHours(1)))) liveStarts.pollFirst();
        if (liveStarts.size() >= limits.liveRunsPerHour()) return null;
        liveStarts.addLast(now);
        return now;
    }

    private synchronized void releaseHourlySlot(Instant slot) {
        liveStarts.removeLastOccurrence(slot);
    }
}
