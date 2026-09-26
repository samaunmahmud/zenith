package com.zenith.llm;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pulls the JSON object out of a model reply. Reasoning models sometimes wrap the answer in
 * &lt;think&gt; blocks or markdown fences even when asked for JSON only.
 */
public final class JsonExtractor {

    private static final Pattern THINK = Pattern.compile("(?is)<think>.*?</think>");
    private static final Pattern FENCE = Pattern.compile("(?is)```(?:json)?\\s*(.*?)```");

    private JsonExtractor() {}

    public static String extract(String text) {
        if (text == null) throw new IllegalArgumentException("Empty model reply");
        String cleaned = THINK.matcher(text).replaceAll("").trim();
        Matcher fence = FENCE.matcher(cleaned);
        if (fence.find()) cleaned = fence.group(1).trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start == -1 || end <= start) throw new IllegalArgumentException("No JSON object found in the model reply");
        return cleaned.substring(start, end + 1);
    }
}
