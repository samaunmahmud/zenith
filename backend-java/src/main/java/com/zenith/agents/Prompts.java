package com.zenith.agents;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads system prompts from src/main/resources/prompts/*.md. Prompts live in their own files, not in the
 * Java code, so they can be read and tuned without touching the logic. {{placeholders}} are filled in here.
 */
public final class Prompts {

    private static final Map<String, String> CACHE = new ConcurrentHashMap<>();

    private Prompts() {}

    private static String raw(String name) {
        return CACHE.computeIfAbsent(name, n -> {
            try (InputStream in = Prompts.class.getResourceAsStream("/prompts/" + n + ".md")) {
                if (in == null) throw new IllegalStateException("Missing prompt file: prompts/" + n + ".md");
                return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    /** Load a prompt and fill in the shared blocks plus any extra variables. */
    public static String load(String name, Map<String, String> vars) {
        String text = raw(name)
                .replace("{{ground_rules}}", raw("_ground-rules"))
                .replace("{{analyst_json}}", raw("_analyst-json"));
        for (var e : vars.entrySet()) text = text.replace("{{" + e.getKey() + "}}", e.getValue());
        return text;
    }

    public static String load(String name) {
        return load(name, Map.of());
    }
}
