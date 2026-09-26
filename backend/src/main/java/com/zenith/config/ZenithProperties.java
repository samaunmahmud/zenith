package com.zenith.config;

import com.zenith.llm.ModelTier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the zenith.* settings in application.yml (values come from .env / environment). */
@ConfigurationProperties(prefix = "zenith")
public record ZenithProperties(
        TokenFactory tokenFactory,
        MarketData marketData,
        Cache cache,
        Budget budget,
        Limits limits,
        boolean demoMode,
        String demoTickers) {

    public record Price(double input, double output) {}

    public record TokenFactory(String apiKey, String baseUrl, Map<ModelTier, String> models, Map<ModelTier, Price> pricing) {
        public boolean configured() {
            return !isBlank(apiKey) && !isBlank(baseUrl);
        }

        /** Base URL without a trailing slash, so we can append "/chat/completions". */
        public String normalisedBaseUrl() {
            return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        }
    }

    public record MarketData(String fmpApiKey, String finnhubApiKey) {}

    public record Cache(String dir, double ttlHours) {}

    /** Hard cap on total Token Factory spend (USD), tracked across restarts. 0 = no model calls at all. */
    public record Budget(double maxUsd) {}

    /**
     * Protects a public demo's budget from bursts of visitors.
     * reuseHours: serve a ticker's saved decision if it is younger than this (0 = always run live).
     * liveRunsPerHour: live (paid) committee runs allowed per rolling hour (0 = no hourly limit).
     * maxConcurrentRuns: live runs allowed at the same time (at least 1).
     */
    public record Limits(double reuseHours, int liveRunsPerHour, int maxConcurrentRuns) {
        public static final Limits NONE = new Limits(0, 0, Integer.MAX_VALUE);
    }

    public List<String> demoTickerList() {
        return Arrays.stream(demoTickers.split(",")).map(String::trim).map(String::toUpperCase).filter(s -> !s.isEmpty()).toList();
    }

    /** The shared cache/ folder at the repo root, whether we run from the repo root, backend/ or Docker. */
    public Path cacheDir() {
        if (!isBlank(cache.dir())) return Path.of(cache.dir());
        Path parent = Path.of("..", "cache");
        return Files.isDirectory(parent) && !Files.isDirectory(Path.of("cache")) ? parent : Path.of("cache");
    }

    public static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
