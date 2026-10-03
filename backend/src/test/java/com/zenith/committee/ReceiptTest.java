package com.zenith.committee;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.json.Json;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.Recommendation;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReceiptTest {

    private static CommitteeResult run(ChairDecision decision) {
        return new CommitteeResult("TEST", "2026-10-03T12:00:00Z", null, List.of(), List.of(), null, List.of(), List.of(),
                List.of(), decision, null, "", null, List.of(), List.of(new AgentModel("chair", "Committee Chair", com.zenith.llm.ModelTier.ULTRA, "fake-ultra", "why", true)),
                false, null, null);
    }

    private static ChairDecision decision(Recommendation call) {
        return new ChairDecision(call, 0.7, "Summary one. Summary two.", List.of("[Risk] a", "[Technicals] b", "[Fundamentals] c"),
                null, List.of("risk one", "risk two"), "3-6 months", List.of());
    }

    @Test
    void aSavedAndReloadedRunVerifies() {
        CommitteeResult r = run(decision(Recommendation.HOLD));
        r = r.withReceipt(Receipt.issue(r));
        CommitteeResult reloaded = Json.MAPPER.readValue(Json.MAPPER.writeValueAsString(r), CommitteeResult.class);

        var check = Receipt.verify(reloaded);
        assertThat(check.intact()).isTrue();
        assertThat(check.changedPrompts()).isEmpty();
        assertThat(r.receipt().prompts()).containsKeys("chair.md", "fundamentals.md", "_ground-rules.md");
        assertThat(r.receipt().models()).containsEntry("chair", "fake-ultra");
    }

    @Test
    void anEditedRulingNoLongerVerifies() {
        CommitteeResult r = run(decision(Recommendation.HOLD));
        Receipt receipt = Receipt.issue(r);
        CommitteeResult edited = run(decision(Recommendation.BUY)).withReceipt(receipt);

        var check = Receipt.verify(edited);
        assertThat(check.rulingMatches()).isFalse();
        assertThat(check.factSheetsMatch()).isTrue();
        assertThat(check.intact()).isFalse();
    }

    @Test
    void promptHashesMatchShasumOfTheFile() throws Exception {
        byte[] file = java.nio.file.Files.readAllBytes(java.nio.file.Path.of("src/main/resources/prompts/chair.md"));
        assertThat(com.zenith.agents.Prompts.sha256("chair")).isEqualTo(Receipt.sha256(file));
    }
}
