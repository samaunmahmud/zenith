package com.zenith.agents;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads system prompts from src/main/resources/prompts/*.md. Prompts live in their own files, not in the
 * Java code, so they can be read and tuned without touching the logic. {{placeholders}} are filled in here.
 */
public final class Prompts {

    private static final Map<String, String> CACHE = new ConcurrentHashMap<>();

    /** Every prompt file, for the decision receipt's fingerprints. */
    public static final List<String> NAMES = List.of("_analyst-json", "_ground-rules", "chair", "devils-advocate",
            "fundamentals", "news", "rebuttal", "risk", "secretary", "technicals");

    private Prompts() {}

    /** SHA-256 of the prompt file exactly as stored, matching {@code shasum -a 256 prompts/<name>.md}. */
    public static String sha256(String name) {
        try (InputStream in = Prompts.class.getResourceAsStream("/prompts/" + name + ".md")) {
            if (in == null) throw new IllegalStateException("Missing prompt file: prompts/" + name + ".md");
            return com.zenith.committee.Receipt.sha256(in.readAllBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

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
