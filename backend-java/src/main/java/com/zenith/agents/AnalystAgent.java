package com.zenith.agents;

import com.zenith.indicators.Snapshot;
import com.zenith.llm.CostTracker;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.Evidence;
import com.zenith.schema.NewsDigest;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/** Runs one of the three analysts: Fundamentals (Super), Technicals (Nano) or Risk (Super). */
@Component
public class AnalystAgent {

    private final TokenFactoryClient llm;

    public AnalystAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public AnalystReport run(AnalystName analyst, Snapshot snapshot, NewsDigest news, CostTracker tracker) {
        String input = AgentInputs.analystInput(analyst, snapshot, news);
        List<Double> allowed = NumberCheck.allowedNumbers(List.of(input));

        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                analyst.id(),
                Roster.ANALYSTS.get(analyst).tier(),
                Prompts.load(analyst.id()),
                input,
                AnalystReport.class,
                0.3,
                tracker,
                // Hard checks: right identity, and every evidence value must trace back to the input.
                report -> {
                    List<String> problems = new ArrayList<>();
                    if (report.analyst() != analyst) problems.add("\"analyst\" must be \"" + analyst.id() + "\"");
                    for (Evidence e : report.evidence()) {
                        List<String> bad = NumberCheck.unsupportedNumbers(e.value(), allowed, false);
                        if (!bad.isEmpty()) {
                            problems.add("evidence \"" + e.metric() + "\" has value \"" + e.value() + "\" with figures not in the input ("
                                    + String.join(", ", bad) + "). Copy values exactly from the input.");
                        }
                    }
                    return problems;
                }));
    }
}
