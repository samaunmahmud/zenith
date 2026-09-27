package com.zenith.track;

/**
 * One committee decision, frozen at the moment it was made: what was called, on which data, at what price.
 * {@code asOf} is the trading day of the data the committee saw; performance is measured from that close.
 */
public record TrackedCall(
        String id,
        String ticker,
        String company,
        String decidedAt,
        String asOf,
        String call,
        double confidence,
        String timeHorizon,
        double entryClose) {}
