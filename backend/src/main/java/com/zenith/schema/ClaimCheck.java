package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** One claim from the investor's thesis, checked against the fact sheets. */
public record ClaimCheck(@NotBlank String claim, @NotNull Assessment assessment, @NotBlank String evidence, AnalystName analyst) {

    public enum Assessment {
        SUPPORTED,
        CONTRADICTED,
        UNVERIFIABLE;

        @JsonValue
        public String id() {
            return name().toLowerCase();
        }
    }
}
