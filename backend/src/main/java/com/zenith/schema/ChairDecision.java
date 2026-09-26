package com.zenith.schema;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ChairDecision(
        @NotNull Recommendation recommendation,
        @NotNull @DecimalMin("0") @DecimalMax("1") Double confidence,
        @NotBlank String summary,
        @NotNull @Size(min = 3, max = 5) List<@NotBlank String> rationale,
        @Valid Dissent dissent, // null = unanimous
        @NotNull @Size(min = 2, max = 4) List<@NotBlank String> keyRisks,
        @NotBlank String timeHorizon) {}
