package com.zenith.llm;

import java.util.List;
import java.util.Map;

/**
 * The raw wire call to an OpenAI-compatible /chat/completions endpoint. An interface so tests can
 * swap in a fake Nemotron without any network.
 */
public interface ChatTransport {

    record Message(String role, String content) {}

    record Request(
            String model,
            List<Message> messages,
            double temperature,
            int maxTokens,
            Map<String, Object> responseFormat) {}

    record Response(String content, int promptTokens, int completionTokens) {}

    /** Thrown when the endpoint rejects the request (non-2xx). */
    class HttpError extends RuntimeException {
        private final int status;

        public HttpError(int status, String body) {
            super("HTTP " + status + ": " + body);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    Response send(Request request);
}
