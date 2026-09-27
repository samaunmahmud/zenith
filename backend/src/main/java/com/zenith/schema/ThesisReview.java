package com.zenith.schema;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** The devil's advocate's cross-examination of an investor's own thesis. */
public record ThesisReview(
        @NotNull ThesisVerdict verdict,
        @NotBlank String summary,
        @NotNull @Size(min = 1, max = 5) List<@Valid ClaimCheck> claims,
        @NotBlank String counterThesis,
        @NotNull @Size(min = 1, max = 3) List<@NotBlank String> blindSpots,
        @NotNull @Size(min = 1, max = 3) List<@NotBlank String> whatWouldChangeIt) {}
