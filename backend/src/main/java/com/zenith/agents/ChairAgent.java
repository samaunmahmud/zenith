package com.zenith.agents;

import com.zenith.indicators.Snapshot;
import com.zenith.llm.CostTracker;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.Rebuttal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** The chair (Nemotron Ultra) weighs the reports and makes the BUY / HOLD / SELL call. */
@Component
public class ChairAgent {

    private static final Pattern NAMES_AN_ANALYST = Pattern.compile("(?i)\\b(fundamentals?|technicals?|risk)\\b");

    private final TokenFactoryClient llm;

    public ChairAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public ChairDecision run(Snapshot snapshot, List<AnalystReport> reports, List<Rebuttal> rebuttals, CostTracker tracker) {
        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                Roster.CHAIR.id(),
                Roster.CHAIR.tier(),
                Prompts.load("chair"),
                AgentInputs.chairInput(snapshot, reports, rebuttals),
                ChairDecision.class,
                0.2,
                tracker,
                d -> {
                    List<String> problems = new ArrayList<>();
                    for (int i = 0; i < d.rationale().size(); i++) {
                        if (!NAMES_AN_ANALYST.matcher(d.rationale().get(i)).find()) {
                            problems.add("rationale[" + i + "] must name the analyst it draws on, e.g. \"[Risk] ...\"");
                        }
                    }
                    if (d.dissent() != null && reports.stream().noneMatch(r -> r.analyst() == d.dissent().analyst())) {
                        problems.add("dissent.analyst \"" + d.dissent().analyst().id() + "\" did not submit a report");
                    }
                    return problems;
                }));
    }
}
