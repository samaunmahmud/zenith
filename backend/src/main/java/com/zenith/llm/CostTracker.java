package com.zenith.llm;

import com.zenith.config.ZenithProperties.Price;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/** Collects the cost of every model call in one committee run. Thread-safe: analysts run in parallel. */
public class CostTracker {

    public record TierTotal(int calls, double usd, long tokens) {}

    public record Summary(
            List<CallCost> calls,
            double totalUsd,
            long totalPromptTokens,
            long totalCompletionTokens,
            Map<ModelTier, TierTotal> byTier,
            // What the same calls (same tokens) would have cost if every one ran on Ultra: the case for tier routing.
            // Null when the Ultra price isn't known (older saved runs, CLI).
            Double allUltraUsd) {}

    private final List<CallCost> calls = new ArrayList<>();
    private final long startedAt = System.currentTimeMillis();

    /** ms from the start of this run (when the tracker was made) to {@code epochMs}. */
    public long offset(long epochMs) {
        return epochMs - startedAt;
    }

    public static double estimateCostUsd(int promptTokens, int completionTokens, double inputPerMillion, double outputPerMillion) {
        return (promptTokens * inputPerMillion + completionTokens * outputPerMillion) / 1_000_000;
    }

    /** Adds a call and returns its index, so a later rejection marks exactly this call. */
    public synchronized int record(CallCost call) {
        calls.add(call);
        return calls.size() - 1;
    }

    public synchronized void markRejected(int index) {
        calls.set(index, calls.get(index).rejected());
    }

    public synchronized List<CallCost> calls() {
        return List.copyOf(calls);
    }

    public Summary summary() {
        return summary(null);
    }

    public synchronized Summary summary(Price ultraPrice) {
        Map<ModelTier, TierTotal> byTier = new EnumMap<>(ModelTier.class);
        for (ModelTier t : ModelTier.values()) byTier.put(t, new TierTotal(0, 0, 0));
        double usd = 0;
        double allUltra = 0;
        long in = 0;
        long out = 0;
        for (CallCost c : calls) {
            if (ultraPrice != null) allUltra += estimateCostUsd(c.promptTokens(), c.completionTokens(), ultraPrice.input(), ultraPrice.output());
            usd += c.estimatedCostUsd();
            in += c.promptTokens();
            out += c.completionTokens();
            TierTotal t = byTier.get(c.tier());
            byTier.put(c.tier(), new TierTotal(t.calls() + 1, t.usd() + c.estimatedCostUsd(), t.tokens() + c.promptTokens() + c.completionTokens()));
        }
        return new Summary(List.copyOf(calls), usd, in, out, byTier, ultraPrice == null ? null : allUltra);
    }
}
