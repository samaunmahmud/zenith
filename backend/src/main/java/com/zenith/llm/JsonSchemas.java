package com.zenith.llm;

import com.github.victools.jsonschema.generator.OptionPreset;
import com.github.victools.jsonschema.generator.SchemaGenerator;
import com.github.victools.jsonschema.generator.SchemaGeneratorConfigBuilder;
import com.github.victools.jsonschema.generator.SchemaVersion;
import com.github.victools.jsonschema.module.jackson.JacksonModule;
import com.github.victools.jsonschema.module.jackson.JacksonOption;
import com.github.victools.jsonschema.module.jakarta.validation.JakartaValidationModule;
import com.github.victools.jsonschema.module.jakarta.validation.JakartaValidationOption;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import tools.jackson.databind.JsonNode;

/**
 * Generates the JSON schema for Token Factory's structured-output mode straight from our Java records,
 * so the schema the model is constrained by and the one we validate against can never drift apart.
 */
public final class JsonSchemas {

    private static final SchemaGenerator GENERATOR = new SchemaGenerator(
            new SchemaGeneratorConfigBuilder(SchemaVersion.DRAFT_2020_12, OptionPreset.PLAIN_JSON)
                    .with(new JacksonModule(JacksonOption.FLATTENED_ENUMS_FROM_JSONVALUE, JacksonOption.RESPECT_JSONPROPERTY_REQUIRED))
                    .with(new JakartaValidationModule(JakartaValidationOption.NOT_NULLABLE_FIELD_IS_REQUIRED))
                    .build());

    private static final Map<Class<?>, JsonNode> CACHE = new ConcurrentHashMap<>();

    private JsonSchemas() {}

    public static JsonNode forType(Class<?> type) {
        return CACHE.computeIfAbsent(type, t -> {
            var schema = GENERATOR.generateSchema(t);
            schema.remove("$schema");
            return schema;
        });
    }
}
