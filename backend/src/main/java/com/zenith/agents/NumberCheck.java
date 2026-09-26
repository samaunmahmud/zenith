package com.zenith.agents;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "LLMs interpret, code calculates": every number an agent writes must trace back to its input.
 * Finds numbers in agent output that don't appear (allowing for rounding) in the input.
 */
public final class NumberCheck {

    // Things that look like numbers but are really names or dates: stripped before checking.
    private static final List<Pattern> NOISE = List.of(
            Pattern.compile("\\b\\d{4}-\\d{2}-\\d{2}\\b"), // ISO dates
            Pattern.compile("(?i)\\b(?:SMA|EMA)\\s?\\d+(?:/\\d+)*\\b"), // SMA200, EMA 50, SMA20/50
            Pattern.compile("(?i)\\bRSI\\s?\\(\\d+\\)|\\bRSI\\d+\\b"), // RSI (14), RSI14 (not "RSI 85": that's a reading)
            Pattern.compile("(?i)\\bMACD\\s?\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*\\)"), // MACD(12,26,9)
            Pattern.compile("(?i)\\b\\d+-(?=\\s+(?:and|or|to)\\s+\\d+[-\\s](?:day|week|month|year|quarter|session)s?\\b)"), // the 20- of "20- and 50-day"
            Pattern.compile("(?i)\\b\\d+[-\\s](?:day|week|month|year|quarter|session)s?\\b"), // 52-week, 3 months
            Pattern.compile("(?i)(?<![\\d.,])\\b\\d+\\s?[dwmy]\\b"), // 20d, 1y (not the 23M of 45.23M)
            Pattern.compile("(?i)\\bS&P\\s?500\\b"),
            Pattern.compile("\\bQ[1-4]\\b"), // Q3
            Pattern.compile("(?<![$\\d.,])\\b(?:19|20)\\d{2}\\b(?![.,]\\d)")); // years (not a $1950.25 price)

    // Models often write typographic hyphens ("52‑week") and no-break spaces ("S&P 500"): fold them to ASCII so NOISE matches.
    private static final Pattern DASHES = Pattern.compile("[\\u2010-\\u2015\\u2212]");
    private static final Pattern SPACES = Pattern.compile("[\\u00A0\\u2007\\u2009\\u202F]");

    private static final Pattern NUMBER =Pattern.compile("-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|-?\\d+(?:\\.\\d+)?");

    public record ParsedNumber(double value, int decimals, String raw) {}

    private NumberCheck() {}

    public static List<ParsedNumber> extractNumbers(String text) {
        String cleaned = text == null ? "" : text;
        cleaned = SPACES.matcher(DASHES.matcher(cleaned).replaceAll("-")).replaceAll(" ");
        for (Pattern p : NOISE) cleaned = p.matcher(cleaned).replaceAll(" ");
        List<ParsedNumber> out = new ArrayList<>();
        Matcher m = NUMBER.matcher(cleaned);
        while (m.find()) {
            String raw = m.group();
            String plain = raw.replace(",", "");
            int dot = plain.indexOf('.');
            // Absolute values: signs are often dropped in prose ("down 12.3%").
            out.add(new ParsedNumber(Math.abs(Double.parseDouble(plain)), dot == -1 ? 0 : plain.length() - dot - 1, raw));
        }
        return out;
    }

    /** Every number present in the inputs. */
    public static List<Double> allowedNumbers(List<String> inputs) {
        return inputs.stream().flatMap(s -> extractNumbers(s).stream()).map(ParsedNumber::value).toList();
    }

    /**
     * A number is supported if some input number rounds to it at the precision the agent used,
     * e.g. "23%" is supported by an input of "23.4%", but "25%" is not.
     */
    public static boolean isSupported(ParsedNumber n, List<Double> allowed) {
        double tolerance = 0.5 * Math.pow(10, -n.decimals()) + 1e-9;
        return allowed.stream().anyMatch(a -> Math.abs(a - n.value()) <= tolerance);
    }

    /** Numbers in {@code text} that don't trace back to the input. Small integers (counts, list items) can be ignored. */
    public static List<String> unsupportedNumbers(String text, List<Double> allowed, boolean ignoreSmallIntegers) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (ParsedNumber n : extractNumbers(text)) {
            if (ignoreSmallIntegers && n.decimals() == 0 && n.value() <= 10) continue;
            if (!isSupported(n, allowed)) out.add(n.raw());
        }
        return List.copyOf(out);
    }

    public static List<String> unsupportedNumbers(String text, List<Double> allowed) {
        return unsupportedNumbers(text, allowed, true);
    }
}
