package com.zenith.data;

public record CompanyProfile(
        String symbol,
        String companyName,
        String sector,
        String industry,
        String description,
        String currency,
        String exchange,
        Double price,
        Double marketCap) {}
