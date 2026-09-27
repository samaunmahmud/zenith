package com.zenith.track;

import com.zenith.committee.CommitteeResult;
import com.zenith.config.ZenithProperties;
import com.zenith.io.AtomicFiles;
import com.zenith.json.Json;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JavaType;

/**
 * Append-only record of every decision the chair has made, kept in {@code cache/_track-record.json}.
 * Only fresh live decisions are added (a replayed decision is the same call, not a new one), and an entry
 * is never edited after the fact: the track record is only worth something if it can't be rewritten.
 *
 * <p>On first start it seeds itself from the saved {@code last-committee.json} runs already on disk,
 * which are genuine past decisions.
 */
@Component
public class DecisionLedger {

    private static final Logger log = LoggerFactory.getLogger(DecisionLedger.class);
    private static final JavaType CALLS = Json.MAPPER.getTypeFactory().constructCollectionType(List.class, TrackedCall.class);
    private static final JavaType RESULT = Json.MAPPER.constructType(CommitteeResult.class);

    private final Path file;
    private final Path cacheDir;
    private List<TrackedCall> calls;
    private boolean unreadable;

    public DecisionLedger(ZenithProperties props) {
        this.cacheDir = props.cacheDir();
        this.file = cacheDir.resolve("_track-record.json");
    }

    /** The recorded calls, oldest first. */
    public synchronized List<TrackedCall> calls() {
        return List.copyOf(load());
    }

    /** Records a fresh decision. Returns false if it has no decision or is already recorded. */
    public synchronized boolean record(CommitteeResult result) {
        TrackedCall call = toCall(result);
        if (call == null) return false;
        List<TrackedCall> current = load();
        if (unreadable) return false;
        if (current.stream().anyMatch(c -> c.id().equals(call.id()))) return false;
        current.add(call);
        save(current);
        log.info("Track record: {} {} at {} (as of {})", call.ticker(), call.call(), call.entryClose(), call.asOf());
        return true;
    }

    static TrackedCall toCall(CommitteeResult r) {
        if (r == null || r.decision() == null || r.snapshot() == null || r.generatedAt() == null) return null;
        return new TrackedCall(
                r.ticker() + "@" + r.generatedAt(),
                r.ticker(),
                r.snapshot().companyName(),
                r.generatedAt(),
                r.snapshot().asOf(),
                r.decision().recommendation().name(),
                r.decision().confidence(),
                r.decision().timeHorizon(),
                r.snapshot().lastClose());
    }

    private List<TrackedCall> load() {
        if (calls != null) return calls;
        if (Files.exists(file)) {
            try {
                calls = new ArrayList<>(Json.MAPPER.readValue(file.toFile(), CALLS));
                return calls;
            } catch (RuntimeException e) {
                // Don't overwrite a ledger we can't read: that would erase the record. Serve nothing until fixed.
                log.error("Track record {} is unreadable; not recording until it is fixed: {}", file, e.getMessage());
                unreadable = true;
                return new ArrayList<>();
            }
        }
        calls = seedFromSavedRuns();
        if (!calls.isEmpty()) save(calls);
        return calls;
    }

    private List<TrackedCall> seedFromSavedRuns() {
        List<TrackedCall> seeded = new ArrayList<>();
        if (!Files.isDirectory(cacheDir)) return seeded;
        try (Stream<Path> dirs = Files.list(cacheDir)) {
            dirs.map(d -> d.resolve("last-committee.json")).filter(Files::isRegularFile).forEach(f -> {
                try {
                    var node = Json.MAPPER.readTree(f.toFile()).path("data");
                    TrackedCall c = toCall(Json.MAPPER.treeToValue(node, RESULT));
                    if (c != null) seeded.add(c);
                } catch (RuntimeException e) {
                    log.warn("Skipping unreadable saved run {}: {}", f, e.getMessage());
                }
            });
        } catch (IOException e) {
            log.warn("Could not scan {} for saved runs: {}", cacheDir, e.getMessage());
        }
        seeded.sort(Comparator.comparing(TrackedCall::decidedAt));
        if (!seeded.isEmpty()) log.info("Track record seeded with {} saved decision(s)", seeded.size());
        return seeded;
    }

    private void save(List<TrackedCall> list) {
        try {
            AtomicFiles.writeString(file, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(list));
        } catch (IOException e) {
            log.error("Could not write track record {}: {}", file, e.getMessage());
        }
    }
}
