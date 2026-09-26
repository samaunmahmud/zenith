package com.zenith.memo;

import com.zenith.committee.AgentModel;
import com.zenith.committee.CommitteeResult;
import com.zenith.llm.CallCost;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Assembles the investment memo in code from the structured outputs. The models write the arguments;
 * code owns the layout, the numbers tables and the disclaimer, so none of those can be hallucinated.
 */
public final class MemoBuilder {

    private MemoBuilder() {}

    private static String cap(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String pct(double x) {
        return Math.round(x * 100) + "%";
    }

    private static String f(String format, Object... args) {
        return String.format(Locale.ROOT, format, args);
    }

    private static List<String> reportSection(AnalystReport r, String model) {
        List<String> lines = new ArrayList<>();
        lines.add("### " + cap(r.analyst().id()) + ": " + r.stance().id().toUpperCase() + " (confidence " + pct(r.confidence()) + ")");
        if (model != null) lines.add("_Model: " + model + "_");
        lines.add("");
        lines.add("**" + r.headline() + "**");
        lines.add("");
        r.keyPoints().forEach(p -> lines.add("- " + p));
        lines.add("");
        lines.add("| Metric | Value | Interpretation |");
        lines.add("|---|---|---|");
        r.evidence().forEach(e -> lines.add("| " + e.metric() + " | " + e.value() + " | " + e.interpretation().replace("|", "/") + " |"));
        if (!r.concerns().isEmpty()) lines.addAll(List.of("", "_What could make this view wrong:_ " + String.join("; ", r.concerns())));
        return lines;
    }

    public static String build(CommitteeResult result) {
        var s = result.snapshot();
        ChairDecision d = result.decision();
        List<String> lines = new ArrayList<>();

        lines.add("# Investment Committee Memo: " + s.ticker() + " (" + s.companyName() + ")");
        lines.add("");
        lines.add("**Date:** " + result.generatedAt().substring(0, 10) + " · **Data as of:** " + s.asOf()
                + " · **Last close:** " + s.facts().technicals().get("Last close"));
        if (s.sector() != null) lines.add("**Sector:** " + s.sector() + (s.industry() != null ? " / " + s.industry() : ""));
        lines.add("");

        if (d != null) {
            lines.add("## Decision: " + d.recommendation() + " (confidence " + pct(d.confidence()) + ", horizon " + d.timeHorizon() + ")");
            lines.addAll(List.of("", d.summary(), "", "### Rationale"));
            d.rationale().forEach(r -> lines.add("- " + r));
            lines.addAll(List.of("", "### Dissent"));
            lines.add(d.dissent() != null
                    ? "> **" + cap(d.dissent().analyst().id()) + " analyst:** " + d.dissent().argument()
                    : "_No dissent recorded: the committee was unanimous._");
            lines.addAll(List.of("", "### Key risks"));
            d.keyRisks().forEach(r -> lines.add("- " + r));
        } else {
            lines.addAll(List.of("## Decision: not available", "",
                    "The chair could not reach a valid decision: " + (result.chairError() != null ? result.chairError() : "unknown error") + "."));
        }

        lines.addAll(List.of("", "## Analyst reports", ""));
        for (AnalystReport r : result.reports()) {
            String model = result.agents().stream().filter(a -> a.id().equals(r.analyst().id())).map(AgentModel::model).findFirst().orElse(null);
            lines.addAll(reportSection(r, model));
            lines.add("");
        }
        for (var e : result.analystErrors()) lines.addAll(List.of("### " + cap(e.analyst().id()) + ": no report", "_" + e.message() + "_", ""));

        if (!result.rebuttals().isEmpty()) {
            lines.addAll(List.of("## Rebuttal round", ""));
            result.rebuttals().forEach(r -> lines.add("- **" + cap(r.analyst().id()) + " → " + cap(r.respondingTo().id()) + "**"
                    + (r.stanceChanged() ? " _(stance changed)_" : "") + ": " + r.response()));
            lines.add("");
        }

        var costs = result.costs();
        lines.addAll(List.of("## Committee cost", "", "| Agent | Model | Tokens (in/out) | Latency | Cost (USD) |", "|---|---|---|---|---|"));
        for (CallCost c : costs.calls()) {
            lines.add(f("| %s%s | %s | %d/%d | %.1fs | $%.5f |", c.agent(), c.attempt() > 1 ? " (retry)" : "", c.model(),
                    c.promptTokens(), c.completionTokens(), c.latencyMs() / 1000.0, c.estimatedCostUsd()));
        }
        lines.add(f("| **Total** | | %d/%d | | **$%.5f** |", costs.totalPromptTokens(), costs.totalCompletionTokens(), costs.totalUsd()));

        lines.addAll(List.of("", "## Data sources"));
        result.sources().forEach(src -> lines.add("- " + src.name() + ", fetched "
                + src.fetchedAt().substring(0, Math.min(16, src.fetchedAt().length())).replace("T", " ") + " UTC"
                + (src.stale() ? " (stale cache)" : "")));

        lines.addAll(List.of("", "---",
                "_Generated by Zenith, an AI investment committee running NVIDIA Nemotron models on Nebius Token Factory. "
                        + "All figures are computed in code from market data; the models only interpret them. "
                        + "**This is a research and education tool, not financial advice.**_"));
        return String.join("\n", lines);
    }
}
