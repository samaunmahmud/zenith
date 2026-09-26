package com.zenith.agents;

import com.zenith.llm.ModelTier;
import com.zenith.schema.AnalystName;
import java.util.List;
import java.util.Map;

/** Which Nemotron model does what, and why. This is the Nano / Super / Ultra split the product shows off. */
public final class Roster {

    public record AgentInfo(String id, String label, ModelTier tier, String why) {}

    public static final Map<AnalystName, AgentInfo> ANALYSTS = Map.of(
            AnalystName.FUNDAMENTALS, new AgentInfo("fundamentals", "Fundamentals Analyst", ModelTier.SUPER,
                    "Weighing valuation against growth, margins and leverage needs mid-weight reasoning."),
            AnalystName.TECHNICALS, new AgentInfo("technicals", "Technicals Analyst", ModelTier.NANO,
                    "Reading well-defined indicators (RSI, MACD, moving averages) is a narrow task, so the fast, cheap model is enough."),
            AnalystName.RISK, new AgentInfo("risk", "Risk Analyst", ModelTier.SUPER,
                    "Combining volatility, drawdown, beta, leverage and news risk into one view needs more reasoning."));

    public static final AgentInfo CHAIR = new AgentInfo("chair", "Committee Chair", ModelTier.ULTRA,
            "The final judgement weighs conflicting arguments and records the dissent, so it gets the strongest reasoning model.");

    public static final AgentInfo NEWS_DESK = new AgentInfo("news", "News Desk", ModelTier.NANO,
            "Summarising headlines into themes is simple, high-volume work, a textbook Nano job.");

    public static final List<AnalystName> ORDER = List.of(AnalystName.FUNDAMENTALS, AnalystName.TECHNICALS, AnalystName.RISK);

    /** Everyone in display order: news desk, the three analysts, then the chair. */
    public static List<AgentInfo> all() {
        return List.of(NEWS_DESK, ANALYSTS.get(AnalystName.FUNDAMENTALS), ANALYSTS.get(AnalystName.TECHNICALS),
                ANALYSTS.get(AnalystName.RISK), CHAIR);
    }

    private Roster() {}
}
