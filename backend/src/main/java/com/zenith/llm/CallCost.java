package com.zenith.llm;

/** The cost of one model call. Recorded for every call, including rejected attempts. */
public record CallCost(
        String agent,
        String model,
        ModelTier tier,
        int promptTokens,
        int completionTokens,
        long latencyMs,
        double estimatedCostUsd,
        int attempt,
        boolean ok,
        // When the call started, in ms from the start of its committee run: the replay draws real overlaps from it.
        // Null for calls outside a run, and in sessions saved before it was recorded.
        Long startMs) {

    public CallCost rejected() {
        return new CallCost(agent, model, tier, promptTokens, completionTokens, latencyMs, estimatedCostUsd, attempt, false, startMs);
    }
}
