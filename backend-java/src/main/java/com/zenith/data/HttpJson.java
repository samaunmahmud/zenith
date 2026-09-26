package com.zenith.data;

import com.zenith.json.Json;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/** Minimal GET-and-parse-JSON helper for the market data APIs. */
@Component
public class HttpJson {

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public record Reply(int status, JsonNode body) {}

    public Reply get(String baseUrl, Map<String, String> params) {
        String qs = params.entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "?" + qs)).timeout(Duration.ofSeconds(20)).GET().build();
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode body;
            try {
                body = Json.MAPPER.readTree(res.body());
            } catch (RuntimeException e) {
                body = Json.MAPPER.missingNode();
            }
            return new Reply(res.statusCode(), body);
        } catch (IOException e) {
            throw new DataException("Could not reach " + URI.create(baseUrl).getHost() + ": " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DataException("Interrupted while fetching market data");
        }
    }
}
