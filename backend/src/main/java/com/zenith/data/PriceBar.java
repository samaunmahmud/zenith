package com.zenith.data;

/** One daily OHLCV bar. Dates are ISO yyyy-MM-dd, so string order is date order. */
public record PriceBar(String date, double open, double high, double low, double close, double volume) {}
