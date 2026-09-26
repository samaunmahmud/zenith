package com.zenith.llm;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pulls the JSON object out of a model reply. Reasoning models sometimes wrap the answer in
 * &lt;think&gt; blocks or markdown fences even when asked for JSON only.
 *
 * <p>Three reasoning shapes are handled: a complete &lt;think&gt;…&lt;/think&gt; block; an orphan
 * &lt;/think&gt; with no opening tag (chat templates that open the block inside the prompt, so the
 * reply starts mid-reasoning); and an unclosed &lt;think&gt; (the reply hit max_tokens while still
 * reasoning). Braces inside the reasoning must never be mistaken for the answer.
 */
public final class JsonExtractor {

    private static final Pattern THINK = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern FENCE = Pattern.compile("(?is)```(?:json)?\\s*(.*?)```");
    private static final String OPEN = "<think>";
    private static final String CLOSE = "</think>";

    private JsonExtractor() {}

    public static String extract(String text) {
        if (text == null) throw new IllegalArgumentException("Empty model reply");
        String cleaned = THINK.matcher(text).replaceAll("");

        // Orphan closing tag: everything before it is reasoning.
        int close = cleaned.toLowerCase().lastIndexOf(CLOSE);
        if (close != -1) cleaned = cleaned.substring(close + CLOSE.length());

        // Unclosed opening tag: the model ran out of tokens mid-reasoning; drop the partial thoughts.
        int open = cleaned.toLowerCase().indexOf(OPEN);
        if (open != -1) {
            cleaned = cleaned.substring(0, open);
            if (cleaned.indexOf('{') == -1) {
                throw new IllegalArgumentException(
                        "Model reply was cut off while still reasoning (unclosed <think>); raise max_tokens");
            }
        }

        cleaned = cleaned.trim();
        Matcher fence = FENCE.matcher(cleaned);
        if (fence.find()) cleaned = fence.group(1).trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start == -1 || end <= start) throw new IllegalArgumentException("No JSON object found in the model reply");
        return cleaned.substring(start, end + 1);
    }
}
