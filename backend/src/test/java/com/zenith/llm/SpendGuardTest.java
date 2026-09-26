package com.zenith.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.zenith.support.TestProps;
import jakarta.validation.Validation;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SpendGuardTest {

    @TempDir
    Path dir;

    private final AtomicInteger sent = new AtomicInteger();

    /** Fake Token Factory: each call costs 1000 in + 200 out tokens (= $0.0016 on Ultra). */
    private TokenFactoryClient client(double budget) {
        var props = TestProps.create(dir, false, 12, budget);
        ChatTransport fake = req -> {
            sent.incrementAndGet();
            return new ChatTransport.Response("hi", 1000, 200);
        };
        return new TokenFactoryClient(fake, props, Validation.buildDefaultValidatorFactory().getValidator(), new SpendGuard(props));
    }

    private void call(TokenFactoryClient c) {
        c.chat("test", ModelTier.ULTRA, List.of(new ChatTransport.Message("user", "hi")), 0.2, 10, null, new CostTracker(), 1);
    }

    @Test
    void aZeroBudgetBlocksEveryCallBeforeAnythingIsSent() {
        TokenFactoryClient c = client(0);
        assertThatThrownBy(() -> call(c)).isInstanceOf(SpendGuard.BudgetExceededException.class).hasMessageContaining("MAX_SPEND_USD is 0");
        assertThat(sent.get()).isZero();
    }

    @Test
    void stopsOnceTheCapIsReached() {
        TokenFactoryClient c = client(0.003); // room for two $0.0016 calls
        call(c);
        call(c);
        assertThatThrownBy(() -> call(c)).isInstanceOf(SpendGuard.BudgetExceededException.class).hasMessageContaining("Spending cap reached");
        assertThat(sent.get()).isEqualTo(2);
        assertThat(c.spendGuard().spentUsd()).isCloseTo(0.0032, within(1e-9));
    }

    @Test
    void theTotalSurvivesARestart() {
        call(client(1.0));
        SpendGuard reloaded = new SpendGuard(TestProps.create(dir, false, 12, 1.0));
        assertThat(reloaded.spentUsd()).isCloseTo(0.0016, within(1e-9));
    }

    @Test
    void anUnreadableLedgerRefusesCallsInsteadOfRestartingFromZero() throws Exception {
        java.nio.file.Files.writeString(dir.resolve("_spend.json"), "{\"totalUsd\": 0.19, \"cal"); // truncated by a crash
        TokenFactoryClient c = client(1.0);
        assertThatThrownBy(() -> call(c)).isInstanceOf(SpendGuard.BudgetExceededException.class).hasMessageContaining("can't be read");
        assertThat(sent.get()).isZero();
        assertThat(java.nio.file.Files.readString(dir.resolve("_spend.json"))).endsWith("\"cal"); // left for inspection
    }

    @Test
    void twoProcessesSharingTheLedgerBothCount() {
        // e.g. the web server and a `--precache --committee` CLI run at the same time
        TokenFactoryClient server = client(1.0);
        TokenFactoryClient cli = client(1.0);
        call(server);
        call(cli);
        call(server);
        SpendGuard reloaded = new SpendGuard(TestProps.create(dir, false, 12, 1.0));
        assertThat(reloaded.spentUsd()).isCloseTo(3 * 0.0016, within(1e-9));
    }

    @Test
    void anotherProcessSpendingTheBudgetIsSeenBeforeTheNextCall() {
        TokenFactoryClient server = client(0.003);
        TokenFactoryClient cli = client(0.003);
        call(cli);
        call(cli); // the CLI uses up the budget
        assertThatThrownBy(() -> call(server)).isInstanceOf(SpendGuard.BudgetExceededException.class);
    }
}
