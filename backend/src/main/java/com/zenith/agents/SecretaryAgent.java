package com.zenith.agents;

import com.zenith.committee.CommitteeResult;
import com.zenith.indicators.Format;
import com.zenith.llm.CostTracker;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.CommitteeAnswer;
import com.zenith.schema.Evidence;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The committee secretary (Nemotron Super): answers a visitor's follow-up questions about one session, from
 * that session's fact sheets, reports, rebuttals and ruling only. Super rather than Ultra: it explains a
 * decision that has already been made, which needs clear reasoning over evidence, not the final judgement.
 */
@Component
public class SecretaryAgent {

    public static final String ID = "secretary";
    public static final ModelTier TIER = ModelTier.SUPER;

    /** One earlier exchange in the conversation, sent back by the client so the server stays stateless. */
    public record Turn(String question, String answer) {}

    private final TokenFactoryClient llm;

    public SecretaryAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public CommitteeAnswer run(CommitteeResult session, List<Turn> history, String question, CostTracker tracker) {
        String sessionText = sessionBlock(session);
        List<Double> allowed = NumberCheck.allowedNumbers(List.of(sessionText));
        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                ID,
                TIER,
                Prompts.load(ID),
                input(sessionText, history, question),
                CommitteeAnswer.class,
                0.3,
                tracker,
                // Same hard check as the analysts: every cited value must come from the session's figures.
                a -> {
                    List<String> problems = new ArrayList<>();
                    for (Evidence e : a.basis()) {
                        List<String> bad = NumberCheck.unsupportedNumbers(e.value(), allowed, false);
                        if (!bad.isEmpty()) {
                            problems.add("basis \"" + e.metric() + "\" has value \"" + e.value() + "\" with figures not in the session ("
                                    + String.join(", ", bad) + "). Copy values exactly from a fact sheet.");
                        }
                    }
                    return problems;
                }));
    }

    /** Everything the committee knew and said in this session. */
    public static String sessionBlock(CommitteeResult session) {
        var s = session.snapshot();
        List<String> parts = new ArrayList<>(List.of(
                "Stock: " + s.ticker() + " (" + s.companyName() + "), sector: " + (s.sector() == null ? Format.NA : s.sector()),
                "Data as of: " + s.asOf() + ". Last close: " + s.facts().technicals().get("Last close"),
                ""));
        for (var analyst : Roster.ORDER) {
            parts.add("## " + analyst.id() + " fact sheet");
            parts.add(AgentInputs.factSheet(AgentInputs.factsFor(analyst, s)));
            parts.add("");
        }
        parts.add(AgentInputs.newsBlock(session.newsDigest()));
        parts.addAll(List.of("", "Analyst reports:"));
        for (AnalystReport r : session.reports()) parts.add(AgentInputs.reportBlock(r));
        if (session.rebuttals() != null && !session.rebuttals().isEmpty()) {
            parts.addAll(List.of("", "Rebuttal round:"));
            session.rebuttals().forEach(r -> parts.add("- " + r.analyst().id() + " → " + r.respondingTo().id()
                    + (r.stanceChanged() ? " (STANCE CHANGED)" : "") + ": " + r.response()));
        }
        var d = session.decision();
        if (d != null) {
            parts.addAll(List.of("", "Chair's decision: " + d.recommendation() + " (confidence " + Format.fixed(d.confidence()) + ", horizon "
                    + d.timeHorizon() + "). " + d.summary()));
            d.rationale().forEach(x -> parts.add("- " + x));
            if (d.dissent() != null) parts.add("Dissent recorded (" + d.dissent().analyst().id() + "): " + d.dissent().argument());
            if (!d.keyRisks().isEmpty()) parts.add("Key risks: " + String.join("; ", d.keyRisks()));
            if (d.watchFor() != null && session.snapshot() != null && session.snapshot().triggers() != null) {
                parts.add("What would change the call (the chair's watch list):");
                for (var w : d.watchFor()) {
                    session.snapshot().triggers().stream().filter(t -> t.id().equals(w.trigger())).findFirst()
                            .ifPresent(t -> parts.add("- If " + t.condition() + ": " + w.wouldMoveTo() + ". " + w.reason()));
                }
            }
        }
        return String.join("\n", parts);
    }

    static String input(String sessionText, List<Turn> history, String question) {
        List<String> parts = new ArrayList<>(List.of(sessionText, "", "<question>"));
        for (Turn t : history) {
            parts.add("Visitor asked earlier: " + t.question());
            parts.add("You answered: " + t.answer());
        }
        parts.addAll(List.of("Visitor asks now: " + question, "</question>", "", "Answer the question as JSON."));
        return String.join("\n", parts);
    }
}
