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
        var ok = new Rebuttal(AnalystName.RISK, AnalystName.TECHNICALS, "word ".repeat(80), false);
        var tooLong = new Rebuttal(AnalystName.RISK, AnalystName.TECHNICALS, "word ".repeat(81), false);
        assertThat(validator.validate(ok)).isEmpty();
        assertThat(validator.validate(tooLong)).extracting(v -> v.getMessage()).containsExactly("response must be 80 words or fewer");
    }

    @Test
    void rebuttalCannotRespondToItself() {
        var self = new Rebuttal(AnalystName.RISK, AnalystName.RISK, "hi", false);
        assertThat(validator.validate(self)).extracting(v -> v.getMessage()).containsExactly("an analyst cannot respond to itself");
    }

    @Test
    void chairDecisionAllowsNullDissentButNotUnknownRecommendations() {
        String json = """
                {"recommendation":"hold","confidence":0.55,"summary":"Mixed.","rationale":["[Fundamentals] a","[Technicals] b","[Risk] c"],
                 "dissent":null,"keyRisks":["x","y"],"timeHorizon":"3-6 months"}""";
        ChairDecision d = Json.MAPPER.readValue(json, ChairDecision.class);
        assertThat(d.recommendation()).isEqualTo(Recommendation.HOLD);
        assertThat(validator.validate(d)).isEmpty();

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
        var r = new Rebuttal(AnalystName.RISK, AnalystName.TECHNICALS, "hi", true);
        assertThat(Json.MAPPER.writeValueAsString(r))
                .isEqualTo("{\"analyst\":\"risk\",\"respondingTo\":\"technicals\",\"response\":\"hi\",\"stanceChanged\":true}");
    }
}
