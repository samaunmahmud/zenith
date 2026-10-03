package com.zenith.data;

import com.zenith.config.ZenithProperties;
import com.zenith.io.AtomicFiles;
import com.zenith.json.Json;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.JsonNode;

/**
 * JSON files under cache/&lt;TICKER&gt;/&lt;name&gt;.json, each stamped with when it was fetched.
 * Cache-first, in this order: fresh cache → live fetch (then cached) → stale cache if the fetch fails.
 * In demo mode only the cache is used, so a live demo never depends on a rate-limited API.
 */
@Component
public class DiskCache {

    private static final Logger log = LoggerFactory.getLogger(DiskCache.class);

    /** {@code source}: which provider answered, when a file can be filled by more than one (else null). */
    public record Entry<T>(String fetchedAt, T data, String source) {}

    public record Result<T>(T data, SourceInfo source) {}

    /** One way to fill a cache file: a label for the sources list ("Tiingo daily prices") and the fetch itself. */
    public record Provider<T>(String label, Supplier<T> fetch) {}

    private final ZenithProperties props;

    public DiskCache(ZenithProperties props) {
        this.props = props;
    }

    private Path fileFor(String ticker, String name) {
        String safe = ticker.toUpperCase().replaceAll("[^A-Z0-9.\\-]", "_");
        return props.cacheDir().resolve(safe).resolve(name + ".json");
    }

    public <T> Optional<Entry<T>> read(String ticker, String name, JavaType dataType) {
        Path file = fileFor(ticker, name);
        if (!Files.exists(file)) return Optional.empty();
        try {
            JsonNode node = Json.MAPPER.readTree(file.toFile());
            T data = Json.MAPPER.treeToValue(node.path("data"), dataType);
            return Optional.of(new Entry<>(node.path("fetchedAt").asString(), data, node.path("source").asString(null)));
        } catch (RuntimeException e) {
            log.warn("Ignoring unreadable cache file {}: {}", file, e.getMessage());
            return Optional.empty();
        }
    }

    public <T> Entry<T> write(String ticker, String name, T data) {
        return write(ticker, name, data, null);
    }

    public <T> Entry<T> write(String ticker, String name, T data, String source) {
        Entry<T> entry = new Entry<>(Instant.now().toString(), data, source);
        Path file = fileFor(ticker, name);
        try {
            // Atomic: concurrent runs share files like SPY/prices.json, and a reader must never see half a file.
            AtomicFiles.writeString(file, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entry));
        } catch (IOException e) {
            log.warn("Could not write cache file {}: {}", file, e.getMessage());
        }
        return entry;
    }

    public <T> Result<T> cached(String ticker, String name, String label, JavaType dataType, Supplier<T> fetcher) {
        return cachedFrom(ticker, name, dataType, List.of(new Provider<>(label, fetcher)));
    }

    /**
     * {@link #cached} with fallback providers, all writing the same file (so readers like the tape don't care who
     * answered). The next provider is tried only when the first says its plan doesn't cover the symbol
     * ({@link PlanLimitException}); from then on any provider failure moves to the next. A real failure of the first
     * provider (unknown ticker, outage) is reported as before. If every provider is plan-limited or fails after a
     * plan limit, the {@link PlanLimitException} is thrown so the caller can explain it.
     */
    public <T> Result<T> cachedFrom(String ticker, String name, JavaType dataType, List<Provider<T>> providers) {
        Optional<Entry<T>> hit = read(ticker, name, dataType);
        boolean fresh = hit.map(e -> ageHours(e.fetchedAt()) < props.cache().ttlHours()).orElse(false);

        if (hit.isPresent() && (fresh || props.demoMode())) {
            String label = hit.get().source() != null ? hit.get().source() : providers.getFirst().label();
            return new Result<>(hit.get().data(), new SourceInfo(label, hit.get().fetchedAt(), false));
        }
        String label = providers.getFirst().label();
        if (props.demoMode()) {
            List<String> available = tickersWith(name);
            throw new DataException("Demo mode: no cached " + label + " for " + ticker + ". "
                    + (available.isEmpty()
                            ? "The cache is empty: run `npm run precache` (and rebuild the image) first."
                            : "Try one of: " + String.join(", ", available)), 404);
        }
        try {
            return fetchFirst(ticker, name, providers);
        } catch (RuntimeException e) {
            if (hit.isPresent()) {
                String staleLabel = hit.get().source() != null ? hit.get().source() : label;
                log.warn("{} fetch failed for {}, serving stale cache: {}", staleLabel, ticker, e.getMessage());
                return new Result<>(hit.get().data(), new SourceInfo(staleLabel, hit.get().fetchedAt(), true));
            }
            throw e;
        }
    }

    private <T> Result<T> fetchFirst(String ticker, String name, List<Provider<T>> providers) {
        PlanLimitException planLimit = null;
        for (Provider<T> p : providers) {
            try {
                // Single-provider files keep no source field, exactly as before.
                Entry<T> entry = write(ticker, name, p.fetch().get(), providers.size() > 1 ? p.label() : null);
                return new Result<>(entry.data(), new SourceInfo(p.label(), entry.fetchedAt(), false));
            } catch (PlanLimitException e) {
                if (planLimit == null) planLimit = e;
                log.info("{} doesn't cover {} on this plan; trying the next provider", p.label(), ticker);
            } catch (DataException e) {
                if (planLimit == null) throw e; // the first provider failed for a real reason
                log.info("Fallback {} failed for {}: {}", p.label(), ticker, e.getMessage());
            }
        }
        throw planLimit;
    }

    /** Tickers that actually have a cached &lt;name&gt;.json, so demo-mode errors suggest what can really be served. */
    List<String> tickersWith(String name) {
        Path root = props.cacheDir();
        if (!Files.isDirectory(root)) return List.of();
        try (Stream<Path> dirs = Files.list(root)) {
            return dirs.filter(d -> Files.isRegularFile(d.resolve(name + ".json")))
                    .map(d -> d.getFileName().toString())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            return List.of();
        }
    }

    private static double ageHours(String fetchedAt) {
        try {
            return Duration.between(Instant.parse(fetchedAt), Instant.now()).toMinutes() / 60.0;
        } catch (RuntimeException e) {
            return Double.MAX_VALUE;
        }
    }
}
