package com.zenith.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.zenith.json.Json;
import org.junit.jupiter.api.Test;

class CostTrackerTest {

    @Test
    void estimatesCostFromPerMillionPrices() {
        // 1000 in × $1/M + 200 out × $3/M
        assertThat(CostTracker.estimateCostUsd(1000, 200, 1.0, 3.0)).isCloseTo(0.0016, within(1e-12));
    }

    @Test
    void marksExactlyTheRejectedCall() {
        CostTracker t = new CostTracker();
        int a = t.record(new CallCost("a", "m", ModelTier.NANO, 1, 1, 1, 0.1, 1, true));
        t.record(new CallCost("b", "m", ModelTier.SUPER, 1, 1, 1, 0.2, 1, true));
        t.markRejected(a);
        assertThat(t.calls()).extracting(CallCost::ok).containsExactly(false, true);
    }

    @Test
    void serialisesTierKeysInLowercaseForTheFrontend() {
        CostTracker t = new CostTracker();
        t.record(new CallCost("a", "m", ModelTier.ULTRA, 1000, 200, 5, 0.0016, 1, true));
        String json = Json.MAPPER.writeValueAsString(t.summary());
        assertThat(json).contains("\"byTier\":{\"nano\":").contains("\"tier\":\"ultra\"");
    }
}
