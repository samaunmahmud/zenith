package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record Rebuttal(
        @NotNull AnalystName analyst,
        @NotNull AnalystName respondingTo,
        @NotBlank String response,
        @NotNull Boolean stanceChanged) {

    public static final int MAX_WORDS = 80;

    @JsonIgnore
    @AssertTrue(message = "response must be 80 words or fewer")
    public boolean isWithinWordLimit() {
        return response == null || response.trim().split("\\s+").length <= MAX_WORDS;
    }

    @JsonIgnore
    @AssertTrue(message = "an analyst cannot respond to itself")
    public boolean isNotRespondingToSelf() {
        return analyst == null || analyst != respondingTo;
    }
}
