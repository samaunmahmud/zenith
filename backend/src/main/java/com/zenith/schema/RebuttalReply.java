package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * What the model returns in the rebuttal round: its reply and where it stands afterwards. Whether that is a change
 * of position is worked out in code by {@link Rebuttal#from}, not taken from the model's word.
 */
public record RebuttalReply(
        @NotNull AnalystName analyst,
        @NotNull AnalystName respondingTo,
        @NotBlank String response,
        @NotNull Stance stanceAfter,
        @NotNull @DecimalMin("0") @DecimalMax("1") Double confidenceAfter) {

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
