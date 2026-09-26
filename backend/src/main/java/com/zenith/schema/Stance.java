package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonValue;

public enum Stance {
    BULLISH,
    NEUTRAL,
    BEARISH;

    @JsonValue
    public String id() {
        return name().toLowerCase();
    }
}
