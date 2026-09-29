package com.zenith.data;

/** A listed security that matches a search: its ticker, company name and exchange. */
public record SymbolMatch(String symbol, String name, String exchange) {}
