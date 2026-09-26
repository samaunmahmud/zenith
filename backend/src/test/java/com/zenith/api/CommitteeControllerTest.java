package com.zenith.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.data.DataException;
import com.zenith.llm.LlmException;
import java.util.List;
import org.junit.jupiter.api.Test;

class CommitteeControllerTest {

    @Test
    void normalisesValidTickersAndRejectsJunk() {
        assertThat(CommitteeController.parseTicker(" aapl ")).contains("AAPL");
        assertThat(CommitteeController.parseTicker("BRK.B")).contains("BRK.B");
        assertThat(CommitteeController.parseTicker("$$")).isEmpty();
        assertThat(CommitteeController.parseTicker("../etc")).isEmpty();
        assertThat(CommitteeController.parseTicker("TOOLONGTICKER")).isEmpty();
        assertThat(CommitteeController.parseTicker(null)).isEmpty();
    }

    @Test
    void mapsErrorsToHttpStatuses() {
        assertThat(CommitteeController.statusFor(new DataException("Unknown ticker", 404))).isEqualTo(404);
        assertThat(CommitteeController.statusFor(new LlmException("bad output", "chair", List.of()))).isEqualTo(502);
        assertThat(CommitteeController.statusFor(new LlmException("x", "news",
                new IllegalStateException("Token Factory is not configured: set TOKEN_FACTORY_API_KEY")))).isEqualTo(503);
        assertThat(CommitteeController.statusFor(new com.zenith.committee.CommitteeService.NotConfiguredException("no key"))).isEqualTo(503);
        assertThat(CommitteeController.statusFor(new RuntimeException("boom"))).isEqualTo(500);
    }
}
