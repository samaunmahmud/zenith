package com.zenith.data;

/** Where a piece of data came from. {@code stale} = served from an expired cache because the live fetch failed. */
public record SourceInfo(String name, String fetchedAt, boolean stale) {}
