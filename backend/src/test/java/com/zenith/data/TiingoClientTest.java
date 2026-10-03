package com.zenith.data;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import com.zenith.support.TestProps;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TiingoClientTest {

    @TempDir
    Path dir;

    /** HttpJson that answers one canned reply and remembers the URL it was asked for. */
    static class FakeHttp extends HttpJson {
        final int status;
        final String body;
        String lastUrl;
        Map<String, String> lastParams = new HashMap<>();

        FakeHttp(int status, String body) {
            this.status = status;
            this.body = body;
        }

        @Override
        public Reply get(String baseUrl, Map<String, String> params) {
            lastUrl = baseUrl;
            lastParams = params;
            return new Reply(status, Json.MAPPER.readTree(body));
        }
    }

    private ZenithProperties withKeys(String fmp, String tiingo) {
        var p = TestProps.create(dir, false, 12);
        return new ZenithProperties(p.tokenFactory(), new ZenithProperties.MarketData(fmp, "", tiingo), p.cache(), p.budget(),
                p.limits(), p.demoMode(), p.demoTickers());
    }

    @Test
    void parsesAdjustedBarsOldestFirstWithPlainDates() {
        var http = new FakeHttp(200, """
                [{"date":"2026-10-02T00:00:00.000Z","close":150.0,"adjClose":150.0,"adjOpen":149,"adjHigh":151,"adjLow":148,"adjVolume":3000000},
                 {"date":"2026-10-01T00:00:00.000Z","close":600.0,"adjClose":150.5,"adjOpen":150,"adjHigh":152,"adjLow":149,"adjVolume":2000000}]
                """);
        var bars = new TiingoClient(http, withKeys("", "tk")).prices("BRK.B", 400);
        assertThat(http.lastUrl).endsWith("/daily/brk-b/prices");
        assertThat(http.lastParams).containsEntry("token", "tk");
        assertThat(bars).extracting(PriceBar::date).containsExactly("2026-10-01", "2026-10-02");
        assertThat(bars.get(0).close()).isEqualTo(150.5); // split-adjusted, not the raw 600
        assertThat(bars.get(0).volume()).isEqualTo(2_000_000);
    }

    @Test
    void unknownTickerIsA404() {
        var http = new FakeHttp(404, "{\"detail\":\"Error: Ticker 'ZZZZQ' not found\"}");
        assertThatThrownBy(() -> new TiingoClient(http, withKeys("", "tk")).prices("ZZZZQ", 400))
                .isInstanceOf(DataException.class)
                .satisfies(e -> assertThat(((DataException) e).status()).isEqualTo(404));
    }

    @Test
    void fmpPlanLimitIsReportedAsSuch() {
        var http = new FakeHttp(402, "\"Special Endpoint : This value set for 'symbol' is not available under your current subscription\"");
        assertThatThrownBy(() -> new FmpClient(http, withKeys("fk", "")).prices("RDDT", 400))
                .isInstanceOf(PlanLimitException.class);
    }
}
