package com.zenith.llm;

import com.zenith.config.ZenithProperties;
import com.zenith.io.AtomicFiles;
import com.zenith.json.Json;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
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
 * <p>The ledger fails closed: if the file exists but can't be read, model calls are refused (and the file
 * is left alone) rather than the total silently restarting from $0. Every update re-reads the file under
 * a file lock and adds to what's on disk, so the web server and a CLI run in parallel both count.
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
    private final Path lockFile;
    private Ledger ledger;
    private boolean unreadable;

    public SpendGuard(ZenithProperties props) {
        this.maxUsd = props.budget() == null ? 0 : props.budget().maxUsd();
        this.file = props.cacheDir().resolve("_spend.json");
        this.lockFile = props.cacheDir().resolve("_spend.lock");
        this.ledger = new Ledger(0, 0, Instant.now().toString());
        refresh();
    }

    /** Re-reads the ledger from disk (another process may have spent since). */
    private synchronized void refresh() {
        if (!Files.exists(file)) {
            unreadable = false;
            return;
        }
        try {
            ledger = Json.MAPPER.readValue(file.toFile(), Ledger.class);
            unreadable = false;
        } catch (RuntimeException e) {
            if (!unreadable) log.error("Spend ledger {} is unreadable; refusing model calls until it is fixed: {}", file, e.getMessage());
            unreadable = true;
        }
    }

    public double maxUsd() {
        return maxUsd;
    }

    public synchronized double spentUsd() {
        return ledger.totalUsd();
    }

    public synchronized boolean available() {
        return !unreadable && ledger.totalUsd() < maxUsd;
    }

    public synchronized String status() {
        return String.format(Locale.ROOT, "$%.4f of $%.2f used", ledger.totalUsd(), maxUsd);
    }

    /** Throws if the cap has been reached. Called before every model call. */
    public synchronized void checkAvailable() {
        refresh();
        if (unreadable) {
            throw new BudgetExceededException("The spend ledger " + file.getFileName()
                    + " can't be read, so model calls are refused to be safe. Fix or delete it to continue.");
        }
        if (!available()) {
            throw new BudgetExceededException(maxUsd == 0
                    ? "AI analysis is switched off: MAX_SPEND_USD is 0 (the default). Set it in .env or the environment"
                    : "Spending cap reached (" + status() + "). Raise MAX_SPEND_USD in .env or the environment to continue.");
        }
    }

    /** Adds the cost of a call to the persisted total: read, add and write under a lock shared with other processes. */
    public synchronized void record(double usd) {
        boolean counted = false;
        try {
            Files.createDirectories(file.getParent());
            try (FileChannel channel = FileChannel.open(lockFile, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                    FileLock ignored = channel.lock()) {
                refresh();
                ledger = new Ledger(ledger.totalUsd() + usd, ledger.calls() + 1, ledger.since());
                counted = true;
                if (unreadable) return; // keep the broken file for inspection; calls stay refused
                AtomicFiles.writeString(file, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(ledger));
            }
        } catch (IOException e) {
            // Still count it in memory, exactly once, so this process keeps enforcing the cap.
            if (!counted) ledger = new Ledger(ledger.totalUsd() + usd, ledger.calls() + 1, ledger.since());
            log.warn("Could not save spend ledger: {}", e.getMessage());
        }
    }
}
