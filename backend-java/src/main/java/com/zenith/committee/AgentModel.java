package com.zenith.committee;

import com.zenith.llm.ModelTier;

/** An agent as shown in the UI: who it is, which Nemotron model runs it, and why. */
public record AgentModel(String id, String label, ModelTier tier, String model, String why) {}
