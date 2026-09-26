package com.zenith.llm;

import java.util.List;

/** A model call failed, or returned invalid output twice. Callers turn this into a clean error state. */
public class LlmException extends RuntimeException {

    private final String agent;
    private final List<String> issues;

    public LlmException(String message, String agent, List<String> issues) {
        super(message);
        this.agent = agent;
        this.issues = List.copyOf(issues);
    }

    public LlmException(String message, String agent, Throwable cause) {
        super(message, cause);
        this.agent = agent;
        this.issues = List.of();
    }

    public String agent() {
        return agent;
    }

    public List<String> issues() {
        return issues;
    }

    /** Message plus the first few validation issues, for showing to the user. */
    public String detail() {
        return issues.isEmpty() ? getMessage() : getMessage() + ": " + String.join("; ", issues.subList(0, Math.min(3, issues.size())));
    }
}
