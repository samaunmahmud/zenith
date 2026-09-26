package com.zenith.llm;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * Calls Nebius Token Factory's OpenAI-compatible /chat/completions endpoint with the JDK's HttpClient.
 * "OpenAI-compatible" means it's a plain JSON POST, so no vendor SDK is needed.
 */
@Component
public class HttpChatTransport implements ChatTransport {

    private static final int MAX_RETRIES = 2; // for 429 rate limits and 5xx errors only

    private final ZenithProperties props;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    public HttpChatTransport(ZenithProperties props) {
        this.props = props;
    }

    @Override
    public Response send(Request request) {
        var tf = props.tokenFactory();
        if (!tf.configured()) {
            throw new IllegalStateException("Token Factory is not configured: set TOKEN_FACTORY_API_KEY in .env");
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.model());
        body.put("messages", request.messages());
        body.put("temperature", request.temperature());
        body.put("max_tokens", request.maxTokens());
        if (request.responseFormat() != null) body.put("response_format", request.responseFormat());

        HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(tf.normalisedBaseUrl() + "/chat/completions"))
                .timeout(Duration.ofSeconds(180))
                .header("Authorization", "Bearer " + tf.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(Json.MAPPER.writeValueAsString(body)))
                .build();

        for (int attempt = 0; ; attempt++) {
            HttpResponse<String> res;
            try {
                res = http.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            } catch (IOException e) {
                if (attempt < MAX_RETRIES) {
                    backoff(attempt);
                    continue;
                }
                throw new IllegalStateException("Could not reach Token Factory: " + e.getMessage(), e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Interrupted while calling Token Factory", e);
            }

            int status = res.statusCode();
            boolean retryable = status == 429 || status >= 500;
            if (retryable && attempt < MAX_RETRIES) {
                backoff(attempt);
                continue;
            }
            if (status / 100 != 2) throw new HttpError(status, truncate(res.body()));

            JsonNode json = Json.MAPPER.readTree(res.body());
            JsonNode message = json.path("choices").path(0).path("message");
            return new Response(
                    message.path("content").asString(""),
                    json.path("usage").path("prompt_tokens").asInt(0),
                    json.path("usage").path("completion_tokens").asInt(0));
        }
    }

    private static void backoff(int attempt) {
        try {
            Thread.sleep(1000L * (1L << attempt)); // 1s, 2s
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String truncate(String s) {
        return s == null ? "" : s.length() > 500 ? s.substring(0, 500) + "…" : s;
    }
}
