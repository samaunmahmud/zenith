package com.zenith.agents;

import com.zenith.llm.CostTracker;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.Rebuttal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** One rebuttal from one analyst. Exactly one round: nobody responds to a rebuttal. */
@Component
public class RebuttalAgent {

    private final TokenFactoryClient llm;

    public RebuttalAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public Rebuttal run(AnalystName analyst, String ticker, List<AnalystReport> reports, CostTracker tracker) {
        AnalystReport own = reports.stream().filter(r -> r.analyst() == analyst).findFirst().orElseThrow();
        List<AnalystReport> others = reports.stream().filter(r -> r.analyst() != analyst).toList();

        List<String> parts = new ArrayList<>(List.of("Stock: " + ticker, "", "Your report:", AgentInputs.reportBlock(own), "", "Your colleagues' reports:"));
        others.forEach(o -> parts.add(AgentInputs.reportBlock(o)));
        parts.addAll(List.of("", "Write your one rebuttal as JSON."));

        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                analyst.id() + "-rebuttal",
                Roster.ANALYSTS.get(analyst).tier(),
                Prompts.load("rebuttal", Map.of("analyst", analyst.id())),
                String.join("\n", parts),
                Rebuttal.class,
                0.3,
                tracker,
                r -> {
                    List<String> problems = new ArrayList<>();
                    if (r.analyst() != analyst) problems.add("\"analyst\" must be \"" + analyst.id() + "\"");
                    if (others.stream().noneMatch(o -> o.analyst() == r.respondingTo())) {
                        problems.add("\"respondingTo\" must be one of: " + String.join(", ", others.stream().map(o -> o.analyst().id()).toList()));
                    }
                    return problems;
                }));
    }
}
