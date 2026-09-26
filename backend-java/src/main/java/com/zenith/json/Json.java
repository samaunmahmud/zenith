package com.zenith.json;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

/** The JSON mapper used for model replies and cache files. Lenient on input, strict on shape via validation. */
public final class Json {

    public static final JsonMapper MAPPER = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES) // ignore extra fields a model adds
            .enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS) // "Buy" and "buy" both mean BUY
            .build();

    private Json() {}
}
