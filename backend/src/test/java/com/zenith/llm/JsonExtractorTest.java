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

    @Test
    void ignoresReasoningBeforeAnOrphanClosingTag() {
        // The chat template opened <think> in the prompt, so the reply starts mid-reasoning.
        String reply = "The schema wants {\"stance\": ...} so let me check.\n</think>\n\n{\"stance\": \"BUY\"}";
        assertThat(JsonExtractor.extract(reply)).isEqualTo("{\"stance\": \"BUY\"}");
    }

    @Test
    void closingTagMatchIsCaseInsensitive() {
        assertThat(JsonExtractor.extract("draft {\"x\": 0}</THINK>{\"a\": 1}")).isEqualTo("{\"a\": 1}");
    }

    @Test
    void reportsTruncationInsideAnUnclosedThinkBlock() {
        assertThatThrownBy(() -> JsonExtractor.extract("<think>Considering {\"stance\": \"BUY\"} versus"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("cut off while still reasoning");
    }

    @Test
    void keepsAnAnswerThatPrecedesAStrayOpeningTag() {
        assertThat(JsonExtractor.extract("{\"a\": 1}\n<think>afterthought {\"b\": 2}")).isEqualTo("{\"a\": 1}");
    }
}
