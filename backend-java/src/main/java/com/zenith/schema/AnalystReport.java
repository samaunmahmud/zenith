package com.zenith.schema;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record AnalystReport(
        @NotNull AnalystName analyst,
        @NotNull Stance stance,
        @NotNull @DecimalMin("0") @DecimalMax("1") Double confidence,
        @NotBlank String headline,
        @NotNull @Size(min = 2, max = 5) List<@NotBlank String> keyPoints,
        @NotNull @Size(min = 1, max = 8) List<@Valid @NotNull Evidence> evidence,
        @NotNull @Size(max = 3) List<@NotBlank String> concerns) {}
