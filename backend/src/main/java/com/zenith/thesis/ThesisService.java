package com.zenith.thesis;

import com.zenith.agents.DevilsAdvocateAgent;
import com.zenith.agents.NumberCheck;
import com.zenith.committee.CommitteeResult;
import com.zenith.committee.CommitteeRunner;
import com.zenith.committee.CommitteeService;
import com.zenith.llm.CostTracker;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.ClaimCheck;
import com.zenith.schema.ThesisReview;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

/**
 * Devil's advocate thesis testing: the investor writes their own case for or against a stock, and the chair
 * cross-examines it against the committee's most recent session on that stock. One Nemotron Ultra call; the
 * committee isn't re-run, so the review stands on exactly the figures the analysts were given.
 */
@Service
public class ThesisService {

    public static final int MIN_CHARS = 20;
    public static final int MAX_CHARS = 1200;

    /** The stock has no committee session to test the thesis against yet (HTTP 409). */
    public static class NoSessionException extends RuntimeException {
        public NoSessionException(String message) {
            super(message);
        }
    }

    /** The thesis is too short, too long or empty (HTTP 400). */
    public static class InvalidThesisException extends RuntimeException {
        public InvalidThesisException(String message) {
            super(message);
        }
    }

    /** Two reviews at a time is plenty for a demo; more waits its turn rather than stacking up Ultra calls (HTTP 429). */
    public static class BusyException extends RuntimeException {
        public BusyException(String message) {
            super(message);
        }
    }

    public record Result(
            String ticker,
            String generatedAt,
            String sessionAt,
            String call,
            String thesis,
            ThesisReview review,
            List<String> untraced,
            CostTracker.Summary costs,
            String memoMarkdown) {}

    private final CommitteeRunner committee;
    private final DevilsAdvocateAgent agent;
    private final TokenFactoryClient llm;
    private final Semaphore running = new Semaphore(2);

    public ThesisService(CommitteeRunner committee, DevilsAdvocateAgent agent, TokenFactoryClient llm) {
        this.committee = committee;
        this.agent = agent;
        this.llm = llm;
    }

    /** Tidies the investor's text and checks its length. Tags that would close the quoted block are removed. */
    public static String clean(String raw) {
        String t = raw == null ? "" : raw.replaceAll("(?i)</?\\s*thesis\\s*>", " ").replaceAll("\\s+", " ").strip();
        if (t.length() < MIN_CHARS) throw new InvalidThesisException("Write at least a sentence: what you think and why (" + MIN_CHARS + "+ characters).");
        if (t.length() > MAX_CHARS) throw new InvalidThesisException("Keep the thesis under " + MAX_CHARS + " characters.");
        return t;
    }

    public Result test(String ticker, String rawThesis) {
        String thesis = clean(rawThesis);
        CommitteeResult session = committee.lastSavedRun(ticker)
                .filter(s -> s.decision() != null && s.snapshot() != null)
                .orElseThrow(() -> new NoSessionException("Convene the committee on " + ticker + " first; the thesis is tested against its findings."));
        if (!llm.configured()) {
            throw new CommitteeService.NotConfiguredException("AI analysis unavailable: Token Factory is not configured");
        }
        llm.spendGuard().checkAvailable();
        if (!running.tryAcquire()) throw new BusyException("The chair is reviewing other theses right now. Try again in a minute.");
        try {
            CostTracker tracker = new CostTracker();
            String input = DevilsAdvocateAgent.input(session, thesis);
            ThesisReview review = agent.run(session, thesis, tracker);
            Result partial = new Result(ticker, Instant.now().toString(), session.generatedAt(), session.decision().recommendation().name(),
                    thesis, review, untraced(review, input), tracker.summary(llm.priceFor(ModelTier.ULTRA)), null);
            return new Result(partial.ticker(), partial.generatedAt(), partial.sessionAt(), partial.call(), partial.thesis(),
                    partial.review(), partial.untraced(), partial.costs(), ThesisMemo.build(partial));
        } finally {
            running.release();
        }
    }

    /**
     * Figures in the review that trace back to neither the committee's input nor the investor's own text.
     * "What would change it" is left out: it proposes thresholds to watch ("growth below 40%"), which are
     * hypothetical by nature, not claims about the data.
     */
    static List<String> untraced(ThesisReview r, String input) {
        List<Double> allowed = NumberCheck.allowedNumbers(List.of(input));
        List<String> texts = new ArrayList<>(List.of(r.summary(), r.counterThesis()));
        for (ClaimCheck c : r.claims()) texts.addAll(List.of(c.claim(), c.evidence()));
        texts.addAll(r.blindSpots());
        LinkedHashSet<String> out = new LinkedHashSet<>();
        texts.forEach(t -> out.addAll(NumberCheck.unsupportedNumbers(t, allowed)));
        return List.copyOf(out);
    }
}
