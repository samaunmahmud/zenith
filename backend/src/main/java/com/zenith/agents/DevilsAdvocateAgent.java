package com.zenith.agents;

import com.zenith.committee.CommitteeResult;
import com.zenith.indicators.Format;
import com.zenith.llm.CostTracker;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ThesisReview;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The chair (Nemotron Ultra) as devil's advocate: cross-examines an investor's own thesis against the
 * committee's fact sheets and reports, and argues the strongest case against it.
 */
@Component
public class DevilsAdvocateAgent {

    public static final String ID = "devils-advocate";

    private final TokenFactoryClient llm;

    public DevilsAdvocateAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public ThesisReview run(CommitteeResult session, String thesis, CostTracker tracker) {
        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                ID,
                Roster.CHAIR.tier(),
                Prompts.load("devils-advocate"),
                input(session, thesis),
                ThesisReview.class,
                0.2,
                tracker,
                r -> List.of()));
    }

    /** Everything the review may draw on: all three fact sheets, the reports, the decision, then the thesis. */
    public static String input(CommitteeResult session, String thesis) {
        var s = session.snapshot();
        List<String> parts = new ArrayList<>(List.of(
                "Stock: " + s.ticker() + " (" + s.companyName() + ")",
                "Data as of: " + s.asOf() + ". Last close: " + s.facts().technicals().get("Last close"),
                ""));
        for (var analyst : Roster.ORDER) {
            parts.add("## " + analyst.id() + " fact sheet");
            parts.add(AgentInputs.factSheet(AgentInputs.factsFor(analyst, s)));
            parts.add("");
        }
        parts.add("Analyst reports:");
        for (AnalystReport r : session.reports()) parts.add(AgentInputs.reportBlock(r));
        var d = session.decision();
        if (d != null) {
            parts.addAll(List.of("", "Committee decision: " + d.recommendation() + " (confidence " + Format.fixed(d.confidence()) + "). " + d.summary()));
        }
        parts.addAll(List.of("", "<thesis>", thesis, "</thesis>", "", "Cross-examine the thesis as JSON."));
        return String.join("\n", parts);
    }
}
