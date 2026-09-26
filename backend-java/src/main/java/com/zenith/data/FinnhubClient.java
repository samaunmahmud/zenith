package com.zenith.data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Finnhub: recent company news headlines (free tier). */
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
}
