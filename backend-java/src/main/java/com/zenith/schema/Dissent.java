package com.zenith.schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** The strongest argument against the chair's decision, and who made it. */
public record Dissent(@NotNull AnalystName analyst, @NotBlank String argument) {}
