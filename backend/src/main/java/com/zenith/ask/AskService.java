package com.zenith.ask;

import com.zenith.agents.NumberCheck;
import com.zenith.agents.SecretaryAgent;
import com.zenith.committee.CommitteeResult;
import com.zenith.committee.CommitteeRunner;
import com.zenith.committee.CommitteeService;
import com.zenith.llm.CostTracker;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.CommitteeAnswer;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;

/**
 * "Ask the committee": follow-up questions about a stock's latest session, answered by the secretary
 * (Nemotron Super) from that session alone. One model call per question; the committee isn't re-run, and the
 * conversation lives in the browser (the last few turns are sent back with each question).
 */
@Service
public class AskService {

    public static final int MIN_CHARS = 3;
    public static final int MAX_CHARS = 400;
    /** Earlier turns sent back with a question: enough for follow-ups, bounded so the prompt stays cheap. */
    public static final int MAX_TURNS = 4;
    private static final int MAX_ANSWER_CHARS = 1500;

    /** The stock has no session to ask about yet (HTTP 409). */
    public static class NoSessionException extends RuntimeException {
        public NoSessionException(String message) {
            super(message);
        }
    }

    /** The question is empty or too long (HTTP 400). */
    public static class InvalidQuestionException extends RuntimeException {
        public InvalidQuestionException(String message) {
            super(message);
        }
    }

    /** Too many questions in flight at once (HTTP 429). */
    public static class BusyException extends RuntimeException {
        public BusyException(String message) {
            super(message);
        }
    }

    public record Result(String ticker, String sessionAt, String question, CommitteeAnswer answer, List<String> untraced, CostTracker.Summary costs) {}

    private final CommitteeRunner committee;
    private final SecretaryAgent agent;
    private final TokenFactoryClient llm;
    private final Semaphore running = new Semaphore(3);

    public AskService(CommitteeRunner committee, SecretaryAgent agent, TokenFactoryClient llm) {
        this.committee = committee;
        this.agent = agent;
        this.llm = llm;
    }

    /** Collapses whitespace and removes tags that would close the quoted block early. */
    static String tidy(String raw) {
        return raw == null ? "" : raw.replaceAll("(?i)</?\\s*question\\s*>", " ").replaceAll("\\s+", " ").strip();
    }

    public static String cleanQuestion(String raw) {
        String q = tidy(raw);
        if (q.length() < MIN_CHARS) throw new InvalidQuestionException("Ask a question about the session.");
        if (q.length() > MAX_CHARS) throw new InvalidQuestionException("Keep questions under " + MAX_CHARS + " characters.");
        return q;
    }

    /** Keeps the most recent turns, each tidied and clipped, dropping any that are empty. */
    static List<SecretaryAgent.Turn> cleanHistory(List<SecretaryAgent.Turn> raw) {
        if (raw == null) return List.of();
        List<SecretaryAgent.Turn> out = new ArrayList<>();
        for (var t : raw.subList(Math.max(0, raw.size() - MAX_TURNS), raw.size())) {
            if (t == null) continue;
            String q = clip(tidy(t.question()), MAX_CHARS);
            String a = clip(tidy(t.answer()), MAX_ANSWER_CHARS);
            if (!q.isEmpty() && !a.isEmpty()) out.add(new SecretaryAgent.Turn(q, a));
        }
        return out;
    }

    private static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    public Result ask(String ticker, String rawQuestion, List<SecretaryAgent.Turn> rawHistory) {
        String question = cleanQuestion(rawQuestion);
        List<SecretaryAgent.Turn> history = cleanHistory(rawHistory);
        CommitteeResult session = committee.lastSavedRun(ticker)
                .filter(s -> s.decision() != null && s.snapshot() != null)
                .orElseThrow(() -> new NoSessionException("Convene the committee on " + ticker + " first; questions are answered from its session."));
        if (!llm.configured()) {
            throw new CommitteeService.NotConfiguredException("AI analysis unavailable: Token Factory is not configured");
        }
        llm.spendGuard().checkAvailable();
        if (!running.tryAcquire()) throw new BusyException("The secretary is answering other questions. Try again in a moment.");
        try {
            CostTracker tracker = new CostTracker();
            CommitteeAnswer answer = agent.run(session, history, question, tracker);
            String allowedText = SecretaryAgent.sessionBlock(session) + "\n" + question;
            return new Result(ticker, session.generatedAt(), question, answer, untraced(answer, allowedText),
                    tracker.summary(llm.priceFor(ModelTier.ULTRA)));
        } finally {
            running.release();
        }
    }

    /** Figures in the answer's prose that appear neither in the session nor in the visitor's own question. */
    static List<String> untraced(CommitteeAnswer a, String allowedText) {
        List<Double> allowed = NumberCheck.allowedNumbers(List.of(allowedText));
        LinkedHashSet<String> out = new LinkedHashSet<>(NumberCheck.unsupportedNumbers(a.answer(), allowed));
        return List.copyOf(out);
    }
}
