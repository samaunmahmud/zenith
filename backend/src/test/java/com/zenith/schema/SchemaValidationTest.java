package com.zenith.schema;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zenith.json.Json;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import org.junit.jupiter.api.Test;

class SchemaValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private static AnalystReport report(double confidence, List<String> keyPoints, List<Evidence> evidence, List<String> concerns) {
        return new AnalystReport(AnalystName.FUNDAMENTALS, Stance.BULLISH, confidence, "Strong margins justify the premium.", keyPoints, evidence, concerns);
    }

    private static final List<Evidence> EVIDENCE = List.of(new Evidence("Gross margin (TTM)", "46.2%", "Best in class"));

    @Test
    void acceptsAValidReport() {
        assertThat(validator.validate(report(0.7, List.of("a", "b"), EVIDENCE, List.of()))).isEmpty();
    }

    @Test
    void rejectsOutOfRangeConfidenceTooFewPointsNoEvidenceAndTooManyConcerns() {
        assertThat(validator.validate(report(1.2, List.of("a", "b"), EVIDENCE, List.of()))).hasSize(1);
        assertThat(validator.validate(report(0.5, List.of("a"), EVIDENCE, List.of()))).hasSize(1);
        assertThat(validator.validate(report(0.5, List.of("a", "b"), List.of(), List.of()))).hasSize(1);
        assertThat(validator.validate(report(0.5, List.of("a", "b"), EVIDENCE, List.of("1", "2", "3", "4")))).hasSize(1);
    }

    @Test
    void rebuttalEnforcesTheEightyWordLimit() {
        var ok = new RebuttalReply(AnalystName.RISK, AnalystName.TECHNICALS, "word ".repeat(80), Stance.NEUTRAL, 0.5);
        var tooLong = new RebuttalReply(AnalystName.RISK, AnalystName.TECHNICALS, "word ".repeat(81), Stance.NEUTRAL, 0.5);
        assertThat(validator.validate(ok)).isEmpty();
        assertThat(validator.validate(tooLong)).extracting(v -> v.getMessage()).containsExactly("response must be 80 words or fewer");
    }

    @Test
    void rebuttalCannotRespondToItself() {
        var self = new RebuttalReply(AnalystName.RISK, AnalystName.RISK, "hi", Stance.NEUTRAL, 0.5);
        assertThat(validator.validate(self)).extracting(v -> v.getMessage()).containsExactly("an analyst cannot respond to itself");
    }

    @Test
    void chairDecisionAllowsNullDissentButNotUnknownRecommendations() {
        String json = """
                {"recommendation":"hold","confidence":0.55,"summary":"Mixed.","rationale":["[Fundamentals] a","[Technicals] b","[Risk] c"],
                 "dissent":null,"keyRisks":["x","y"],"timeHorizon":"3-6 months",
                 "watchFor":[{"trigger":"up-15","wouldMoveTo":"BUY","reason":"r"},{"trigger":"down-15","wouldMoveTo":"SELL","reason":"r"}]}""";
        ChairDecision d = Json.MAPPER.readValue(json, ChairDecision.class);
        assertThat(d.recommendation()).isEqualTo(Recommendation.HOLD);
        assertThat(validator.validate(d)).isEmpty();

        // The watch list is required of the chair, with two or three conditions.
        ChairDecision noWatch = Json.MAPPER.readValue(json.replaceFirst(",\\s*\"watchFor\":\\[.*\\]", ""), ChairDecision.class);
        assertThat(noWatch.watchFor()).isNull();
        assertThat(validator.validate(noWatch)).extracting(v -> v.getPropertyPath().toString()).containsExactly("watchFor");

        assertThatThrownBy(() -> Json.MAPPER.readValue(json.replace("\"hold\"", "\"STRONG BUY\""), ChairDecision.class))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void parsesLowercaseEnumsAndLenientAnalystNames() {
        String json = """
                {"analyst":"Technical","stance":"bearish","confidence":0.4,"headline":"h","keyPoints":["a","b"],
                 "evidence":[{"metric":"RSI (14)","value":"72.1","interpretation":"overbought"}],"concerns":[],"extraField":1}""";
        AnalystReport r = Json.MAPPER.readValue(json, AnalystReport.class);
        assertThat(r.analyst()).isEqualTo(AnalystName.TECHNICALS);
        assertThat(r.stance()).isEqualTo(Stance.BEARISH);
    }

    @Test
    void serialisesEnumsInLowercase() {
        var r = Rebuttal.legacy(AnalystName.RISK, AnalystName.TECHNICALS, "hi", true);
        // A rebuttal saved before positions were measured serialises exactly as it did, so its receipt still matches.
        assertThat(Json.MAPPER.writeValueAsString(r))
                .isEqualTo("{\"analyst\":\"risk\",\"respondingTo\":\"technicals\",\"response\":\"hi\",\"stanceChanged\":true}");
        assertThat(Json.MAPPER.readValue(Json.MAPPER.writeValueAsString(r), Rebuttal.class)).isEqualTo(r);
    }

    @Test
    void derivesAChangeOfStanceFromTheReportAndTheReply() {
        var own = report(0.7, List.of("a", "b"), EVIDENCE, List.of());
        var moved = Rebuttal.from(new RebuttalReply(AnalystName.FUNDAMENTALS, AnalystName.RISK, "Fair point.", Stance.NEUTRAL, 0.5), own);
        var held = Rebuttal.from(new RebuttalReply(AnalystName.FUNDAMENTALS, AnalystName.RISK, "No.", Stance.BULLISH, 0.8), own);

        assertThat(moved.stanceChanged()).isTrue();
        assertThat(moved.shift()).isEqualTo("bullish → neutral");
        assertThat(moved.changeNote()).isEqualTo("stance changed: bullish → neutral");
        assertThat(held.stanceChanged()).isFalse();
        assertThat(held.changeNote()).isEmpty();
        assertThat(held.confidenceBefore()).isEqualTo(0.7);
        assertThat(held.confidenceAfter()).isEqualTo(0.8);
        assertThat(Rebuttal.legacy(AnalystName.RISK, AnalystName.TECHNICALS, "hi", true).changeNote()).isEqualTo("stance changed");
    }
}
