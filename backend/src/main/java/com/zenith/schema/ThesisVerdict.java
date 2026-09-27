package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonValue;

/** How well the investor's thesis stands up against the committee's figures. */
public enum ThesisVerdict {
    SUPPORTED,
    PARTLY_SUPPORTED,
    CONTRADICTED,
    UNTESTABLE;

    @JsonValue
    public String id() {
        return name().toLowerCase();
    }
}
