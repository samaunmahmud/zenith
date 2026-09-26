package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record NewsDigest(
        @NotNull Sentiment sentiment,
        @NotNull @Size(max = 4) List<String> themes,
        @NotNull @Size(max = 4) List<String> notableEvents) {

    public enum Sentiment {
        POSITIVE,
        MIXED,
        NEGATIVE,
        NONE;

        @JsonValue
        public String id() {
            return name().toLowerCase();
        }
    }
}
