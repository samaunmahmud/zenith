package com.zenith.committee;

import com.zenith.data.NewsItem;
import com.zenith.data.SourceInfo;
import com.zenith.indicators.Snapshot;
import com.zenith.llm.CostTracker;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.NewsDigest;
import com.zenith.schema.Rebuttal;
import java.util.List;

/** Everything one committee meeting produced. This is the API response. */
public record CommitteeResult(
        String ticker,
        String generatedAt,
        Snapshot snapshot,
        List<SourceInfo> sources,
        List<NewsItem> news,
        NewsDigest newsDigest,
        List<AnalystReport> reports,
        List<AnalystError> analystErrors,
        List<Rebuttal> rebuttals,
        ChairDecision decision,
        String chairError,
        String memoMarkdown,
        CostTracker.Summary costs,
        List<IntegrityFlag> integrity,
        List<AgentModel> agents,
        boolean replayed,
        // Why a saved decision was served instead of a live run: "recent", "busy" or "fallback". Null for live runs.
        String replayReason) {

    public record AnalystError(AnalystName analyst, String message) {}

    /** Figures in an agent's free text that couldn't be traced to its input. */
    public record IntegrityFlag(String agent, List<String> figures) {}

    public CommitteeResult withMemo(String memo) {
        return new CommitteeResult(ticker, generatedAt, snapshot, sources, news, newsDigest, reports, analystErrors,
                rebuttals, decision, chairError, memo, costs, integrity, agents, replayed, replayReason);
    }

    /** Served from the last saved run instead of a live one; see CommitteeGate for the reasons. */
    public CommitteeResult asReplay(String reason) {
        return new CommitteeResult(ticker, generatedAt, snapshot, sources, news, newsDigest, reports, analystErrors,
                rebuttals, decision, chairError, memoMarkdown, costs, integrity, agents, true, reason);
    }
}
