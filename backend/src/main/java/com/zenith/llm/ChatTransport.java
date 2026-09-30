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
            Map<String, Object> responseFormat,
            // false = ask the model to skip its reasoning pass; true = leave it on (the model's default)
            boolean reasoning) {}

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

    /**
     * The request may have reached the endpoint (e.g. it timed out waiting for the reply), so it may have been
     * processed and billed even though no usage came back. Never retried; the caller records a conservative cost.
     */
    class MaybeBilledException extends RuntimeException {
        public MaybeBilledException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    Response send(Request request);
}
