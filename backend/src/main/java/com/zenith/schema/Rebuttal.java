package com.zenith.schema;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One analyst's rebuttal as the committee records it. {@code stanceChanged} is derived in code from the stance in the
 * analyst's report ({@code stanceBefore}) and the one it holds after the round ({@code stanceAfter}). Sessions saved
 * before that have no before/after, and their {@code stanceChanged} is the model's own flag; the new fields are left
 * out of the JSON when absent, so those sessions still hash to the receipts they were issued with.
 */
public record Rebuttal(
        AnalystName analyst,
        AnalystName respondingTo,
        String response,
        Boolean stanceChanged,
        @JsonInclude(JsonInclude.Include.NON_NULL) Stance stanceBefore,
        @JsonInclude(JsonInclude.Include.NON_NULL) Double confidenceBefore,
        @JsonInclude(JsonInclude.Include.NON_NULL) Stance stanceAfter,
        @JsonInclude(JsonInclude.Include.NON_NULL) Double confidenceAfter) {

    /** The rebuttal as recorded, with the change of position measured against the analyst's own report. */
    public static Rebuttal from(RebuttalReply reply, AnalystReport own) {
        return new Rebuttal(reply.analyst(), reply.respondingTo(), reply.response(), reply.stanceAfter() != own.stance(),
                own.stance(), own.confidence(), reply.stanceAfter(), reply.confidenceAfter());
    }

    /** A rebuttal saved before positions were measured: only the model's own flag is known. */
    public static Rebuttal legacy(AnalystName analyst, AnalystName respondingTo, String response, boolean stanceChanged) {
        return new Rebuttal(analyst, respondingTo, response, stanceChanged, null, null, null, null);
    }

    /** "bullish → neutral" when the stance moved and both ends are known, otherwise null. */
    public String shift() {
        return Boolean.TRUE.equals(stanceChanged) && stanceBefore != null && stanceAfter != null
                ? stanceBefore.id() + " → " + stanceAfter.id()
                : null;
    }

    /** The marker the chair, secretary and memo print after a rebuttal: empty unless the stance changed. */
    public String changeNote() {
        if (!Boolean.TRUE.equals(stanceChanged)) return "";
        String shift = shift();
        return shift == null ? "stance changed" : "stance changed: " + shift;
    }
}
