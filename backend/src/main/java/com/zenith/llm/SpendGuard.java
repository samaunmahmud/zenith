package com.zenith.llm;

import com.zenith.config.ZenithProperties;
import com.zenith.json.Json;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Hard spending cap for Token Factory. Keeps a running total of estimated spend in cache/_spend.json
 * (so it survives restarts) and refuses new model calls once MAX_SPEND_USD is reached. This protects
 * a small credit balance from test runs, and a public demo URL from being drained by visitors.
 *
 * <p>Calls already in flight when the cap is hit still complete, so the total can overshoot by at most
 * the cost of a few parallel calls (fractions of a cent).
 */
@Component
public class SpendGuard {

    private static final Logger log = LoggerFactory.getLogger(SpendGuard.class);

    public record Ledger(double totalUsd, int calls, String since) {}

    public static class BudgetExceededException extends RuntimeException {
        public BudgetExceededException(String message) {
            super(message);
        }
    }

    private final double maxUsd;
    private final Path file;
    private Ledger ledger;

    public SpendGuard(ZenithProperties props) {
        this.maxUsd = props.budget() == null ? 0 : props.budget().maxUsd();
        this.file = props.cacheDir().resolve("_spend.json");
        this.ledger = load();
    }

    private Ledger load() {
        try {
            if (Files.exists(file)) return Json.MAPPER.readValue(file.toFile(), Ledger.class);
        } catch (RuntimeException e) {
            log.warn("Unreadable spend ledger {}, starting from zero: {}", file, e.getMessage());
        }
        return new Ledger(0, 0, Instant.now().toString());
    }

    public double maxUsd() {
        return maxUsd;
    }

    public synchronized double spentUsd() {
        return ledger.totalUsd();
    }

    public synchronized boolean available() {
        return ledger.totalUsd() < maxUsd;
    }

    public synchronized String status() {
        return String.format(Locale.ROOT, "$%.4f of $%.2f used", ledger.totalUsd(), maxUsd);
    }

    /** Throws if the cap has been reached. Called before every model call. */
    public synchronized void checkAvailable() {
        if (!available()) {
            throw new BudgetExceededException(maxUsd == 0
                    ? "AI analysis is switched off: MAX_SPEND_USD is 0 in .env"
                    : "Spending cap reached (" + status() + "). Raise MAX_SPEND_USD in .env to continue.");
        }
    }

    /** Adds the cost of a completed call to the persisted total. */
    public synchronized void record(double usd) {
        ledger = new Ledger(ledger.totalUsd() + usd, ledger.calls() + 1, ledger.since());
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(ledger));
        } catch (IOException e) {
            log.warn("Could not save spend ledger: {}", e.getMessage());
        }
    }
}
