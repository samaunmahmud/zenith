package com.zenith.data;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;

/**
 * Financial Modeling Prep "stable" API: daily prices and fundamentals. We use FMP rather than Alpha Vantage
 * because Alpha Vantage's free tier only returns 100 days of prices: not enough for SMA200 or a 1-year view.
 */
@Component
public class FmpClient {

    private static final String BASE = "https://financialmodelingprep.com/stable/";

    private final HttpJson http;
    private final ZenithProperties props;

    public FmpClient(HttpJson http, ZenithProperties props) {
        this.http = http;
        this.props = props;
    }

    private JsonNode get(String endpoint, Map<String, String> params) {
        String key = props.marketData().fmpApiKey();
        if (ZenithProperties.isBlank(key)) throw new DataException("FMP is not configured: set FMP_API_KEY in .env", 503);
        Map<String, String> all = new HashMap<>(params);
        all.put("apikey", key);
        HttpJson.Reply reply = http.get(BASE + endpoint, all);
        // FMP reports errors as { "Error Message": "..." }, sometimes with a 200 status.
        if (reply.body().has("Error Message")) {
            throw new DataException("FMP " + endpoint + ": " + reply.body().path("Error Message").asString());
        }
        if (reply.status() / 100 != 2) throw new DataException("FMP " + endpoint + ": HTTP " + reply.status());
        return reply.body();
    }

    private static Map<String, Object> firstRecord(JsonNode body) {
        if (!body.isArray() || body.isEmpty() || !body.get(0).isObject()) return Map.of();
        return Json.MAPPER.convertValue(body.get(0), new TypeReference<Map<String, Object>>() {});
    }

    public List<PriceBar> prices(String ticker, int days) {
        String from = LocalDate.now().minusDays(days).toString();
        JsonNode body = get("historical-price-eod/full", Map.of("symbol", ticker, "from", from));
        // Older API versions wrapped the rows in { "historical": [...] }.
        JsonNode rows = body.isArray() ? body : body.path("historical");
        List<PriceBar> bars = new ArrayList<>();
        for (JsonNode r : rows) {
            JsonNode close = r.has("close") ? r.path("close") : r.path("adjClose");
            if (!r.hasNonNull("date") || !close.isNumber()) continue;
            bars.add(new PriceBar(r.path("date").asString(), r.path("open").asDouble(), r.path("high").asDouble(),
                    r.path("low").asDouble(), close.asDouble(), r.path("volume").asDouble()));
        }
        if (bars.isEmpty()) throw new DataException("No price history found for " + ticker + ". Is the ticker right?", 404);
        bars.sort(Comparator.comparing(PriceBar::date));
        return bars;
    }

    public CompanyProfile profile(String ticker) {
        Map<String, Object> p = firstRecord(get("profile", Map.of("symbol", ticker)));
        if (p.get("symbol") == null) throw new DataException("Unknown ticker: " + ticker, 404);
        return new CompanyProfile(
                String.valueOf(p.get("symbol")),
                str(p.get("companyName"), ticker),
                str(p.get("sector"), null),
                str(p.get("industry"), null),
                str(p.get("description"), null),
                str(p.get("currency"), null),
                str(p.get("exchange"), str(p.get("exchangeShortName"), null)),
                num(p.get("price")),
                num(p.get("marketCap")) != null ? num(p.get("marketCap")) : num(p.get("mktCap")));
    }

    public Map<String, Object> ratiosTtm(String ticker) {
        return firstRecord(get("ratios-ttm", Map.of("symbol", ticker)));
    }

    public Map<String, Object> keyMetricsTtm(String ticker) {
        return firstRecord(get("key-metrics-ttm", Map.of("symbol", ticker)));
    }

    public Map<String, Object> growth(String ticker) {
        return firstRecord(get("financial-growth", Map.of("symbol", ticker, "limit", "1")));
    }

    /** Securities whose ticker matches {@code query}, on any exchange. */
    public List<SymbolMatch> searchSymbol(String query) {
        return matches(get("search-symbol", Map.of("query", query, "limit", "20")));
    }

    /** Securities whose company name matches {@code query}, on any exchange. */
    public List<SymbolMatch> searchName(String query) {
        return matches(get("search-name", Map.of("query", query, "limit", "20")));
    }

    private static List<SymbolMatch> matches(JsonNode body) {
        List<SymbolMatch> out = new ArrayList<>();
        if (!body.isArray()) return out;
        for (JsonNode r : body) {
            String symbol = r.path("symbol").asString("");
            if (symbol.isBlank()) continue;
            out.add(new SymbolMatch(symbol, r.path("name").asString(symbol), r.path("exchange").asString("")));
        }
        return out;
    }

    private static String str(Object v, String fallback) {
        return v instanceof String s && !s.isBlank() ? s : fallback;
    }

    private static Double num(Object v) {
        return v instanceof Number n && Double.isFinite(n.doubleValue()) ? n.doubleValue() : null;
    }
}
