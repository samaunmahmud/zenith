package com.zenith.data;

import com.zenith.config.ZenithProperties;
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

    public record Entry<T>(String fetchedAt, T data) {}

    public record Result<T>(T data, SourceInfo source) {}

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
            return Optional.of(new Entry<>(node.path("fetchedAt").asString(), data));
        } catch (RuntimeException e) {
            log.warn("Ignoring unreadable cache file {}: {}", file, e.getMessage());
            return Optional.empty();
        }
    }

    public <T> Entry<T> write(String ticker, String name, T data) {
        Entry<T> entry = new Entry<>(Instant.now().toString(), data);
        Path file = fileFor(ticker, name);
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, Json.MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entry));
        } catch (IOException e) {
            log.warn("Could not write cache file {}: {}", file, e.getMessage());
        }
        return entry;
    }

    public <T> Result<T> cached(String ticker, String name, String label, JavaType dataType, Supplier<T> fetcher) {
        Optional<Entry<T>> hit = read(ticker, name, dataType);
        boolean fresh = hit.map(e -> ageHours(e.fetchedAt()) < props.cache().ttlHours()).orElse(false);

        if (hit.isPresent() && (fresh || props.demoMode())) {
            return new Result<>(hit.get().data(), new SourceInfo(label, hit.get().fetchedAt(), false));
        }
        if (props.demoMode()) {
            List<String> available = tickersWith(name);
            throw new DataException("Demo mode: no cached " + label + " for " + ticker + ". "
                    + (available.isEmpty()
                            ? "The cache is empty: run `npm run precache` (and rebuild the image) first."
                            : "Try one of: " + String.join(", ", available)), 404);
        }
        try {
            Entry<T> entry = write(ticker, name, fetcher.get());
            return new Result<>(entry.data(), new SourceInfo(label, entry.fetchedAt(), false));
        } catch (RuntimeException e) {
            if (hit.isPresent()) {
                log.warn("{} fetch failed for {}, serving stale cache: {}", label, ticker, e.getMessage());
                return new Result<>(hit.get().data(), new SourceInfo(label, hit.get().fetchedAt(), true));
            }
            throw e;
        }
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
