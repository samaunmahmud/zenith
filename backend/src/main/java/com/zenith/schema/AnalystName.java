package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum AnalystName {
    FUNDAMENTALS,
    TECHNICALS,
    RISK;

    @JsonValue
    public String id() {
        return name().toLowerCase();
    }

    /** Lenient parsing: models sometimes write "Fundamentals" or "technical". */
    @JsonCreator
    public static AnalystName parse(String raw) {
        String s = raw == null ? "" : raw.trim().toUpperCase();
        for (AnalystName a : values()) {
            if (s.equals(a.name()) || (s.length() >= 4 && a.name().startsWith(s))) return a;
        }
        throw new IllegalArgumentException("must be one of fundamentals, technicals, risk (got \"" + raw + "\")");
    }
}
