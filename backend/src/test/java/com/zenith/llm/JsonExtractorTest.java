package com.zenith.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class JsonExtractorTest {

    @Test
    void stripsThinkBlocksAndMarkdownFences() {
        assertThat(JsonExtractor.extract("<think>hmm {\"no\": 1}</think>\n```json\n{\"a\": 1}\n```")).isEqualTo("{\"a\": 1}");
    }

    @Test
    void findsTheObjectInsideProse() {
        assertThat(JsonExtractor.extract("Sure! {\"a\": {\"b\": 2}} Hope that helps")).isEqualTo("{\"a\": {\"b\": 2}}");
    }

    @Test
    void throwsWhenThereIsNoJson() {
        assertThatThrownBy(() -> JsonExtractor.extract("no json here")).isInstanceOf(IllegalArgumentException.class);
    }
}
