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
