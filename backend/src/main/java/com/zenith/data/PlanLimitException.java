package com.zenith.data;

/**
 * The provider knows the symbol but our free plan doesn't cover it (FMP answers HTTP 402 for many tickers and
 * all ETFs). Not the user's mistake and not an outage, so the data layer falls back to another provider.
 */
public class PlanLimitException extends DataException {

    public PlanLimitException(String message) {
        super(message, 402);
    }
}
