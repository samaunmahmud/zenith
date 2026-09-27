package com.zenith.track;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.committee.CommitteeResult;
import com.zenith.json.Json;
import com.zenith.support.TestProps;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DecisionLedgerTest {

    @TempDir Path dir;

    private static CommitteeResult result(String ticker, String at, String call) {
        String json = """
                {"ticker":"%s","generatedAt":"%s","replayed":false,
                 "snapshot":{"ticker":"%s","companyName":"%s Inc","asOf":"2026-09-25","lastClose":123.45},
                 "decision":{"recommendation":"%s","confidence":0.7,"summary":"s","rationale":[],"keyRisks":[],"timeHorizon":"3-6 months"}}
                """.formatted(ticker, at, ticker, ticker, call);
        return Json.MAPPER.readValue(json, CommitteeResult.class);
    }

    @Test
    void recordsEachDecisionOnceAndSurvivesARestart() {
        DecisionLedger ledger = new DecisionLedger(TestProps.create(dir, false, 12));
        assertThat(ledger.record(result("AAPL", "2026-09-26T10:00:00Z", "BUY"))).isTrue();
        assertThat(ledger.record(result("AAPL", "2026-09-26T10:00:00Z", "BUY"))).isFalse(); // same run again
        assertThat(ledger.record(result("AAPL", "2026-09-27T10:00:00Z", "SELL"))).isTrue();

        var reopened = new DecisionLedger(TestProps.create(dir, false, 12)).calls();
        assertThat(reopened).extracting(TrackedCall::call).containsExactly("BUY", "SELL");
        assertThat(reopened.get(0).entryClose()).isEqualTo(123.45);
        assertThat(reopened.get(0).asOf()).isEqualTo("2026-09-25");
    }

    @Test
    void neverOverwritesALedgerItCannotRead() throws Exception {
        Path file = dir.resolve("_track-record.json");
        Files.writeString(file, "[{\"id\": broken");
        DecisionLedger ledger = new DecisionLedger(TestProps.create(dir, false, 12));
        assertThat(ledger.record(result("AAPL", "2026-09-26T10:00:00Z", "BUY"))).isFalse();
        assertThat(Files.readString(file)).isEqualTo("[{\"id\": broken");
    }

    @Test
    void seedsItselfFromSavedRunsOnFirstStart() throws Exception {
        Path saved = dir.resolve("NVDA").resolve("last-committee.json");
        Files.createDirectories(saved.getParent());
        Files.writeString(saved, "{\"fetchedAt\":\"x\",\"data\":" + Json.MAPPER.writeValueAsString(result("NVDA", "2026-09-26T09:00:00Z", "BUY")) + "}");

        var calls = new DecisionLedger(TestProps.create(dir, false, 12)).calls();
        assertThat(calls).extracting(TrackedCall::ticker).containsExactly("NVDA");
        assertThat(Files.exists(dir.resolve("_track-record.json"))).isTrue();
    }
}
