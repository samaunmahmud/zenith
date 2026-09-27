package com.zenith.schema;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * The committee secretary's answer to a follow-up question about a session. {@code basis} lists the figures
 * the answer rests on, each copied from a fact sheet, so the answer can be checked like an analyst's report.
 */
public record CommitteeAnswer(
        @NotBlank @Size(max = 2400) String answer,
        @NotNull @Size(max = 6) List<@Valid Evidence> basis,
        @NotNull @Size(max = 3) List<@NotBlank String> followUps) {}
