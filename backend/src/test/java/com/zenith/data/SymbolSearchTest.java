package com.zenith.data;

import static org.assertj.core.api.Assertions.assertThat;

import com.zenith.support.TestProps;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SymbolSearchTest {

    @TempDir Path dir;

    private static SymbolMatch m(String symbol, String name, String exchange) {
        return new SymbolMatch(symbol, name, exchange);
    }

    // What FMP actually returned for "sandisk" on 2026-09-29.
    private static final List<SymbolMatch> SANDISK = List.of(
            m("SNDK.TO", "Sandisk Corporation", "TSX"),
            m("SNDK", "Sandisk Corporation", "NASDAQ"),
            m("SNDKV", "Sandisk Corporation", "NASDAQ"));

    @Test
    void findsACompanyByNameAndKeepsOnlyItsPlainUsListing() {
        assertThat(SymbolSearch.rank("sandisk", SANDISK)).extracting(SymbolMatch::symbol).containsExactly("SNDK");
    }

    @Test
    void ranksAnExactTickerFirstThenTickerPrefixesThenNames() {
        List<SymbolMatch> found = SymbolSearch.rank("amd", List.of(
                m("AMDL", "GraniteShares 2x Long AMD", "NASDAQ"),
                m("AMDA", "Amedica", "NASDAQ"),
                m("AMD", "Advanced Micro Devices", "NASDAQ"),
                m("AMD.L", "Some London line", "LSE")));
        assertThat(found).extracting(SymbolMatch::symbol).containsExactly("AMD", "AMDA", "AMDL");
    }

    @Test
    void dropsMutualFundsAndAStocksWarrantLine() {
        List<SymbolMatch> found = SymbolSearch.rank("berkshire", List.of(
                m("BGRY", "Berkshire Grey, Inc.", "NASDAQ"),
                m("BFOCX", "Berkshire Focus Fund", "NASDAQ"),
                m("BGRYW", "Berkshire Grey, Inc.", "NASDAQ"),
                m("BRK-B", "Berkshire Hathaway Inc.", "NYSE")));
        assertThat(found).extracting(SymbolMatch::symbol).containsExactly("BGRY", "BRK-B");
    }

    @Test
    void keepsNyseAndHyphenatedClassShares() {
        assertThat(SymbolSearch.rank("berkshire", List.of(m("BRK-B", "Berkshire Hathaway Inc.", "NYSE"), m("BRK-A", "Berkshire Hathaway Inc.", "NYSE"))))
                .extracting(SymbolMatch::symbol).containsExactly("BRK-A", "BRK-B");
    }

    @Test
    void asksFmpOnceAndThenAnswersFromMemory() {
        AtomicInteger calls = new AtomicInteger();
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        SymbolSearch search = new SymbolSearch(q -> { calls.incrementAndGet(); return List.of(); }, q -> SANDISK, cache, false);

        assertThat(search.search("Sandisk")).extracting(SymbolMatch::symbol).containsExactly("SNDK");
        assertThat(search.search("  sandisk ")).extracting(SymbolMatch::symbol).containsExactly("SNDK");
        assertThat(calls.get()).isEqualTo(1);
        assertThat(search.search("")).isEmpty();
        assertThat(search.search("x".repeat(SymbolSearch.MAX_QUERY + 1))).isEmpty();
    }

    @Test
    void fallsBackToCachedStocksWhenFmpFailsOrIsOff() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        cache.write("NVDA", "profile", new CompanyProfile("NVDA", "NVIDIA Corporation", null, null, null, "USD", "NASDAQ", null, null));
        cache.write("JPM", "profile", new CompanyProfile("JPM", "JPMorgan Chase & Co.", null, null, null, "USD", "NYSE", null, null));

        SymbolSearch failing = new SymbolSearch(q -> { throw new DataException("FMP down"); }, q -> List.of(), cache, false);
        assertThat(failing.search("nvidia")).extracting(SymbolMatch::symbol).containsExactly("NVDA");

        SymbolSearch offline = new SymbolSearch(q -> { throw new AssertionError("must not call FMP"); }, q -> List.of(), cache, true);
        assertThat(offline.search("jp")).extracting(SymbolMatch::symbol).containsExactly("JPM");
        assertThat(offline.search("tesla")).isEmpty();
    }

    @Test
    void capsLiveSearchesPerRollingDayThenSearchesTheCache() {
        DiskCache cache = new DiskCache(TestProps.create(dir, false, 12));
        cache.write("NVDA", "profile", new CompanyProfile("NVDA", "NVIDIA Corporation", null, null, null, "USD", "NASDAQ", null, null));
        AtomicInteger calls = new AtomicInteger();
        MutableClock clock = new MutableClock(Instant.parse("2026-10-01T09:00:00Z"));
        SymbolSearch search = new SymbolSearch(q -> { calls.incrementAndGet(); return List.of(); }, q -> SANDISK, cache, false, 2, clock);

        search.search("sandisk");
        search.search("apple");
        assertThat(calls.get()).isEqualTo(2);
        // The day's allowance is used: the cache answers, and FMP isn't asked.
        assertThat(search.search("nvidia")).extracting(SymbolMatch::symbol).containsExactly("NVDA");
        assertThat(calls.get()).isEqualTo(2);
        // A day later the window has moved on, and a query the cache answered is asked live again.
        clock.now = clock.now.plus(Duration.ofDays(1)).plusSeconds(1);
        search.search("nvidia");
        assertThat(calls.get()).isEqualTo(3);
    }

    @Test
    void doesNotSearchASingleCharacter() {
        SymbolSearch search = new SymbolSearch(q -> { throw new AssertionError("must not call FMP"); }, q -> List.of(),
                new DiskCache(TestProps.create(dir, false, 12)), false);
        assertThat(search.search("f")).isEmpty();
    }

    private static final class MutableClock extends Clock {
        Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
