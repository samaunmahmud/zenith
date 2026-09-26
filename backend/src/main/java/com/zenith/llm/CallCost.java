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
        boolean ok) {

    public CallCost rejected() {
        return new CallCost(agent, model, tier, promptTokens, completionTokens, latencyMs, estimatedCostUsd, attempt, false);
    }
}
