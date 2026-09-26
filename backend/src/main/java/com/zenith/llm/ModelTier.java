package com.zenith.llm;

import com.fasterxml.jackson.annotation.JsonValue;

/** The three NVIDIA Nemotron sizes used by the committee. */
public enum ModelTier {
    NANO,
    SUPER,
    ULTRA;

    @JsonValue
    public String id() {
        return name().toLowerCase();
    }
}
