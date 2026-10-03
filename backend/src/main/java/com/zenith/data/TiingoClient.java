package com.zenith.data;

import com.zenith.config.ZenithProperties;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Tiingo end-of-day prices: the fallback when FMP's free plan doesn't cover a symbol. Tiingo's free tier has daily
 * history for every US stock and ETF, so a judge can type almost any ticker and still get a committee.
 */
@Component
public class TiingoClient {

    private static final String BASE = "https://api.tiingo.com/tiingo/daily/";

    private final HttpJson http;
    private final ZenithProperties props;

    public TiingoClient(HttpJson http, ZenithProperties props) {
        this.http = http;
        this.props = props;
    }

    public boolean configured() {
        return !ZenithProperties.isBlank(props.marketData().tiingoApiKey());
    }

    /** Tiingo writes share classes with a dash and in lower case: BRK.B → brk-b. */
    static String symbol(String ticker) {
        return ticker.trim().replace('.', '-').toLowerCase(Locale.ROOT);
    }

    private JsonNode get(String path, Map<String, String> params, String ticker) {
        if (!configured()) throw new DataException("Tiingo is not configured: set TIINGO_API_KEY in .env", 503);
        Map<String, String> all = new java.util.HashMap<>(params);
        all.put("token", props.marketData().tiingoApiKey());
        HttpJson.Reply reply = http.get(BASE + path, all);
        if (reply.status() == 404) throw new DataException("Unknown ticker: " + ticker, 404);
        if (reply.status() / 100 != 2) throw new DataException("Tiingo " + path + ": HTTP " + reply.status());
        return reply.body();
    }

    /**
     * Daily bars, oldest first. Uses Tiingo's split- and dividend-adjusted fields so a stock split doesn't look like
     * a crash to the indicators (FMP's series is split-adjusted too). The latest bar's adjusted close is its close.
     */
    public List<PriceBar> prices(String ticker, int days) {
        String sym = symbol(ticker);
        JsonNode rows = get(sym + "/prices", Map.of("startDate", LocalDate.now().minusDays(days).toString()), ticker);
        List<PriceBar> bars = new ArrayList<>();
        for (JsonNode r : rows) {
            JsonNode close = r.path("adjClose").isNumber() ? r.path("adjClose") : r.path("close");
            String date = r.path("date").asString("");
            if (date.length() < 10 || !close.isNumber()) continue;
            bars.add(new PriceBar(date.substring(0, 10), // "2026-10-02T00:00:00.000Z" → "2026-10-02"
                    adjusted(r, "Open"), adjusted(r, "High"), adjusted(r, "Low"), close.asDouble(), adjusted(r, "Volume")));
        }
        if (bars.isEmpty()) throw new DataException("No price history found for " + ticker + ". Is the ticker right?", 404);
        bars.sort(Comparator.comparing(PriceBar::date));
        return bars;
    }

    private static double adjusted(JsonNode r, String field) {
        JsonNode adj = r.path("adj" + field);
        return adj.isNumber() ? adj.asDouble() : r.path(field.toLowerCase(Locale.ROOT)).asDouble();
    }

    /** Name and exchange only: Tiingo's metadata has no sector or market cap. Last resort for ETFs. */
    public CompanyProfile profile(String ticker) {
        JsonNode m = get(symbol(ticker), Map.of(), ticker);
        String name = m.path("name").asString("");
        if (name.isBlank()) throw new DataException("Unknown ticker: " + ticker, 404);
        String description = m.path("description").asString("");
        return new CompanyProfile(ticker, name, null, null, description.isBlank() ? null : description, "USD",
                m.path("exchangeCode").asString(null), null, null);
    }
}
