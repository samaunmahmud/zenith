package com.zenith.data;

import com.zenith.json.Json;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;

/**
 * Finnhub (free tier): recent company news, plus a company profile and "basic financials" for the symbols FMP's
 * free plan doesn't cover. Basic financials also carry forward P/E, which FMP's free plan doesn't have at all.
 */
@Component
public class FinnhubClient {

    private final HttpJson http;

    public FinnhubClient(HttpJson http) {
        this.http = http;
    }

    public List<NewsItem> news(String ticker, String apiKey, int days, int max) {
        LocalDate to = LocalDate.now();
        HttpJson.Reply reply = http.get("https://finnhub.io/api/v1/company-news", Map.of(
                "symbol", ticker, "from", to.minusDays(days).toString(), "to", to.toString(), "token", apiKey));
        if (reply.status() / 100 != 2) throw new DataException("Finnhub company-news: HTTP " + reply.status());
        if (!reply.body().isArray()) return List.of();

        List<JsonNode> rows = new ArrayList<>(StreamSupport.stream(reply.body().spliterator(), false)
                .filter(r -> !r.path("headline").asString("").isBlank())
                .toList());
        rows.sort((a, b) -> Long.compare(b.path("datetime").asLong(), a.path("datetime").asLong()));

        Set<String> seen = new HashSet<>();
        List<NewsItem> out = new ArrayList<>();
        for (JsonNode r : rows) {
            String headline = r.path("headline").asString();
            if (!seen.add(headline.toLowerCase())) continue; // de-duplicate syndicated stories
            String summary = r.path("summary").asString("");
            out.add(new NewsItem(headline, r.path("source").asString(""),
                    Instant.ofEpochSecond(r.path("datetime").asLong()).toString(), r.path("url").asString(""),
                    summary.length() > 300 ? summary.substring(0, 300) : summary));
            if (out.size() == max) break;
        }
        return out;
    }

    /** Name, industry, exchange and market cap. Finnhub answers {} for a symbol it doesn't know (and for ETFs). */
    public CompanyProfile profile(String ticker, String apiKey) {
        JsonNode p = get("stock/profile2", ticker, apiKey);
        String name = p.path("name").asString("");
        if (name.isBlank()) throw new DataException("Unknown ticker: " + ticker, 404);
        JsonNode cap = p.path("marketCapitalization"); // in millions
        return new CompanyProfile(ticker, name, null, blankToNull(p.path("finnhubIndustry").asString("")), null,
                blankToNull(p.path("currency").asString("")), blankToNull(p.path("exchange").asString("")), null,
                cap.isNumber() && cap.asDouble() > 0 ? cap.asDouble() * 1e6 : null);
    }

    /** The raw "metric" object of /stock/metric: Finnhub's field names and units (percentages as 12.5, not 0.125). */
    public Map<String, Object> metrics(String ticker, String apiKey) {
        JsonNode metric = get("stock/metric", ticker, apiKey, "metric", "all").path("metric");
        if (!metric.isObject() || metric.isEmpty()) return Map.of();
        return Json.MAPPER.convertValue(metric, new TypeReference<Map<String, Object>>() {});
    }

    private JsonNode get(String endpoint, String ticker, String apiKey, String... extra) {
        Map<String, String> params = new java.util.HashMap<>(Map.of("symbol", ticker, "token", apiKey));
        for (int i = 0; i + 1 < extra.length; i += 2) params.put(extra[i], extra[i + 1]);
        HttpJson.Reply reply = http.get("https://finnhub.io/api/v1/" + endpoint, params);
        if (reply.status() / 100 != 2) throw new DataException("Finnhub " + endpoint + ": HTTP " + reply.status());
        return reply.body();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
