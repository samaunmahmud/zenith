package com.zenith.committee;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.JsonTypeName;
import com.zenith.data.NewsItem;
import com.zenith.data.SourceInfo;
import com.zenith.indicators.Snapshot;
import com.zenith.schema.AnalystName;
import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.NewsDigest;
import com.zenith.schema.Rebuttal;
import java.util.List;

/**
 * Progress events streamed to the browser over Server-Sent Events, so analyst cards appear as each
 * agent finishes. Serialised with a "type" field, e.g. {"type":"report","report":{...}}.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(CommitteeEvent.Stage.class),
    @JsonSubTypes.Type(CommitteeEvent.SnapshotReady.class),
    @JsonSubTypes.Type(CommitteeEvent.News.class),
    @JsonSubTypes.Type(CommitteeEvent.Report.class),
    @JsonSubTypes.Type(CommitteeEvent.AnalystFailed.class),
    @JsonSubTypes.Type(CommitteeEvent.RebuttalReady.class),
    @JsonSubTypes.Type(CommitteeEvent.Decision.class),
    @JsonSubTypes.Type(CommitteeEvent.Done.class),
    @JsonSubTypes.Type(CommitteeEvent.Error.class)
})
public sealed interface CommitteeEvent {

    /** The SSE event name (matches the "type" property). */
    default String type() {
        return getClass().getAnnotation(JsonTypeName.class).value();
    }

    @JsonTypeName("stage")
    record Stage(String stage, String message) implements CommitteeEvent {}

    @JsonTypeName("snapshot")
    record SnapshotReady(Snapshot snapshot, List<SourceInfo> sources, List<NewsItem> news, List<AgentModel> agents) implements CommitteeEvent {}

    @JsonTypeName("news")
    record News(NewsDigest digest) implements CommitteeEvent {}

    @JsonTypeName("report")
    record Report(AnalystReport report) implements CommitteeEvent {}

    @JsonTypeName("analystError")
    record AnalystFailed(AnalystName analyst, String message) implements CommitteeEvent {}

    @JsonTypeName("rebuttal")
    record RebuttalReady(Rebuttal rebuttal) implements CommitteeEvent {}

    @JsonTypeName("decision")
    record Decision(ChairDecision decision) implements CommitteeEvent {}

    @JsonTypeName("done")
    record Done(CommitteeResult result) implements CommitteeEvent {}

    @JsonTypeName("error")
    record Error(String message, int status) implements CommitteeEvent {}
}
