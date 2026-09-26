package com.zenith.support;

import com.zenith.config.ZenithProperties;
import com.zenith.llm.ModelTier;
import java.nio.file.Path;
import java.util.Map;

/** ZenithProperties for tests: fake model ids, real list prices, a temp cache dir. */
public final class TestProps {

    private TestProps() {}

    public static ZenithProperties create(Path cacheDir, boolean demoMode, double ttlHours) {
        return create(cacheDir, demoMode, ttlHours, 100.0);
    }

    public static ZenithProperties create(Path cacheDir, boolean demoMode, double ttlHours, double budgetUsd) {
        return new ZenithProperties(
                new ZenithProperties.TokenFactory("test-key", "http://fake/v1/",
                        Map.of(ModelTier.NANO, "fake-nano", ModelTier.SUPER, "fake-super", ModelTier.ULTRA, "fake-ultra"),
                        Map.of(ModelTier.NANO, new ZenithProperties.Price(0.06, 0.24),
                                ModelTier.SUPER, new ZenithProperties.Price(0.30, 0.90),
                                ModelTier.ULTRA, new ZenithProperties.Price(1.00, 3.00))),
                new ZenithProperties.MarketData("", ""),
                new ZenithProperties.Cache(cacheDir.toString(), ttlHours),
                new ZenithProperties.Budget(budgetUsd),
                ZenithProperties.Limits.NONE,
                demoMode,
                "AAPL,NVDA");
    }
}
