package com.zenith.schema;

import jakarta.validation.constraints.NotBlank;

/** One cited figure. {@code value} must be copied exactly from the analyst's input data. */
public record Evidence(@NotBlank String metric, @NotBlank String value, @NotBlank String interpretation) {}
