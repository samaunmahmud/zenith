package com.zenith.llm;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.schema.AnalystReport;
import com.zenith.schema.ChairDecision;
import com.zenith.schema.Rebuttal;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

class JsonSchemasTest {

    @Test
    void analystReportSchemaHasLowercaseEnumsRequiredFieldsAndBounds() {
        JsonNode s = JsonSchemas.forType(AnalystReport.class);
        assertThat(s.path("properties").path("stance").path("enum").toString()).isEqualTo("[\"bullish\",\"neutral\",\"bearish\"]");
        assertThat(s.path("properties").path("analyst").path("enum").toString()).isEqualTo("[\"fundamentals\",\"technicals\",\"risk\"]");
        assertThat(s.path("required").toString()).contains("analyst", "stance", "confidence", "headline", "keyPoints", "evidence", "concerns");
        assertThat(s.path("properties").path("keyPoints").path("minItems").asInt()).isEqualTo(2);
        assertThat(s.path("properties").path("keyPoints").path("maxItems").asInt()).isEqualTo(5);
        assertThat(s.has("$schema")).isFalse();
    }

    @Test
    void helperValidationMethodsAreNotPartOfTheSchema() {
        JsonNode s = JsonSchemas.forType(Rebuttal.class);
        assertThat(s.path("properties").propertyNames()).containsExactlyInAnyOrder("analyst", "respondingTo", "response", "stanceChanged");
    }

    @Test
    void chairDissentIsOptional() {
        JsonNode s = JsonSchemas.forType(ChairDecision.class);
        assertThat(s.path("required").toString()).doesNotContain("dissent");
    }
}
