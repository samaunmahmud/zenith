package com.zenith.committee;

import com.zenith.llm.ModelTier;

/**
 * An agent as shown in the UI: who it is, which Nemotron model runs it, why, and whether it reasons before answering.
 * {@code reasoning} is null in sessions saved before it was recorded.
 */
public record AgentModel(String id, String label, ModelTier tier, String model, String why, Boolean reasoning) {}
