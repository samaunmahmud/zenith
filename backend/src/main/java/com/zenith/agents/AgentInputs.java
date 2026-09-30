package com.zenith.agents;

import com.zenith.indicators.Format;
import com.zenith.indicators.Snapshot;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.NewsDigest;
import com.zenith.schema.Rebuttal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Builds the exact text each agent sees. These strings are also the source of truth for the
 * "no invented numbers" check, so the check and the prompt can never disagree.
 */
public final class AgentInputs {

    private AgentInputs() {}

    public static Map<String, String> factsFor(AnalystName analyst, Snapshot s) {
        return switch (analyst) {
            case FUNDAMENTALS -> s.facts().fundamentals();
            case TECHNICALS -> s.facts().technicals();
            case RISK -> s.facts().risk();
        };
    }

    /** Technicals deliberately works from price data only; the others also see the news digest. */
    public static boolean seesNews(AnalystName analyst) {
        return analyst != AnalystName.TECHNICALS;
    }

    public static String factSheet(Map<String, String> facts) {
        return facts.entrySet().stream().map(e -> "- " + e.getKey() + ": " + e.getValue()).collect(Collectors.joining("\n"));
    }

    public static String newsBlock(NewsDigest news) {
        if (news == null || news.sentiment() == NewsDigest.Sentiment.NONE) return "Recent news: none available.";
        List<String> lines = new ArrayList<>();
        lines.add("Recent news (summarised by the news desk, sentiment: " + news.sentiment().id() + "):");
        news.themes().forEach(t -> lines.add("- Theme: " + t));
        news.notableEvents().forEach(e -> lines.add("- Event: " + e));
        return String.join("\n", lines);
    }

    public static String analystInput(AnalystName analyst, Snapshot s, NewsDigest news) {
        List<String> parts = new ArrayList<>(List.of(
                "Stock: " + s.ticker() + " (" + s.companyName() + ")",
                "Data as of: " + s.asOf(),
                "",
                "Input data:",
                factSheet(factsFor(analyst, s))));
        if (seesNews(analyst)) parts.addAll(List.of("", newsBlock(news)));
        parts.addAll(List.of("", "Write your " + analyst.id() + " report on " + s.ticker() + " as JSON."));
        return String.join("\n", parts);
    }

    public static String reportBlock(AnalystReport r) {
        String evidence = r.evidence().stream()
                .map(e -> "- " + e.metric() + ": " + e.value() + ". " + e.interpretation())
                .collect(Collectors.joining("\n"));
        String concerns = r.concerns().isEmpty() ? "- none stated" : r.concerns().stream().map(c -> "- " + c).collect(Collectors.joining("\n"));
        return String.join("\n",
                "## " + r.analyst().id() + " analyst: " + r.stance().id() + " (confidence " + Format.fixed(r.confidence()) + ")",
                "Headline: " + r.headline(),
                "Key points:\n" + r.keyPoints().stream().map(p -> "- " + p).collect(Collectors.joining("\n")),
                "Evidence:\n" + evidence,
                "Concerns:\n" + concerns);
    }

    public static String chairInput(Snapshot s, List<AnalystReport> reports, List<Rebuttal> rebuttals) {
        List<String> parts = new ArrayList<>(List.of(
                "Stock: " + s.ticker() + " (" + s.companyName() + "), sector: " + (s.sector() == null ? Format.NA : s.sector()),
                "Data as of: " + s.asOf() + ". Last close: " + s.facts().technicals().get("Last close"),
                "",
                "Analyst reports:"));
        reports.forEach(r -> parts.add(reportBlock(r)));
        List<String> missing = Roster.ORDER.stream()
                .filter(a -> reports.stream().noneMatch(r -> r.analyst() == a))
                .map(AnalystName::id)
                .toList();
        if (!missing.isEmpty()) parts.addAll(List.of("", "Missing reports (analyst failed): " + String.join(", ", missing)));
        if (!rebuttals.isEmpty()) {
            parts.addAll(List.of("", "Rebuttal round:"));
            rebuttals.forEach(r -> parts.add("- " + r.analyst().id() + " → " + r.respondingTo().id()
                    + (r.stanceChanged() ? " (STANCE CHANGED)" : "") + ": " + r.response()));
        }
        if (s.triggers() != null && !s.triggers().isEmpty()) {
            parts.addAll(List.of("", "Watch list options (pick 2 or 3 for watchFor, using the id exactly):"));
            s.triggers().forEach(t -> parts.add("- " + t.id() + ": " + t.condition()));
        }
        parts.addAll(List.of("", "Make the committee's decision as JSON."));
        return String.join("\n", parts);
    }
}
