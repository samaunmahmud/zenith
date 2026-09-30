package com.zenith.schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** One condition on the chair's watch list: a trigger id from the snapshot's menu, and what the call would become. */
public record WatchItem(@NotBlank String trigger, @NotNull Recommendation wouldMoveTo, @NotBlank String reason) {}
