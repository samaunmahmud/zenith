package com.zenith.tape;

import com.zenith.config.ZenithProperties;
import com.zenith.data.CompanyProfile;
import com.zenith.data.DiskCache;
import com.zenith.data.PriceBar;
import com.zenith.data.TradingDay;
import com.zenith.json.Json;
import com.zenith.track.DecisionLedger;
import com.zenith.track.TrackedCall;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JavaType;

/**
 * The landing page's ticker tape: for each stock on file, its last recorded close and the committee's latest call.
 *
 * <p>Read from the disk cache only, never fetched: a page view must not spend market-data quota, and the tape must
 * not pretend to be live. Every row carries the date of its close so the page can say how old it is.
 */
@Service
public class TapeService {

    /** Closes kept for the sparkline: about six weeks of trading days. */
    static final int SPARK_DAYS = 30;

    private static final JavaType BARS = Json.MAPPER.getTypeFactory().constructCollectionType(List.class, PriceBar.class);
    private static final JavaType PROFILE = Json.MAPPER.constructType(CompanyProfile.class);

    /** The committee's most recent call on a stock, as recorded in the ledger. */
    public record LastCall(String call, double confidence, String decidedAt) {}

    /** One stock on the tape. {@code change} is a fraction of the previous close (0.012 = +1.2%). */
    public record Row(String ticker, String company, String asOf, double close, Double change, List<Double> spark, LastCall lastCall) {}

    private final DiskCache cache;
    private final DecisionLedger ledger;
    private final ZenithProperties props;

    public TapeService(DiskCache cache, DecisionLedger ledger, ZenithProperties props) {
        this.cache = cache;
        this.ledger = ledger;
        this.props = props;
    }

    /** One row per on-file ticker that has cached prices, in the configured order. */
    public List<Row> rows() {
        List<TrackedCall> calls = ledger.calls();
        List<Row> rows = new ArrayList<>();
        for (String ticker : props.demoTickerList()) {
            row(ticker, calls).ifPresent(rows::add);
        }
        return rows;
    }

    Optional<Row> row(String ticker, List<TrackedCall> calls) {
        List<PriceBar> bars = cache.<List<PriceBar>>read(ticker, "prices", BARS)
                .map(e -> TradingDay.completed(e.data(), e.fetchedAt()))
                .orElse(List.of());
        if (bars.isEmpty()) return Optional.empty();

        PriceBar last = bars.getLast();
        Double change = bars.size() < 2 || bars.get(bars.size() - 2).close() == 0 ? null
                : last.close() / bars.get(bars.size() - 2).close() - 1;
        List<Double> spark = bars.subList(Math.max(0, bars.size() - SPARK_DAYS), bars.size()).stream().map(PriceBar::close).toList();
        String company = cache.<CompanyProfile>read(ticker, "profile", PROFILE).map(e -> e.data().companyName()).orElse(ticker);

        // The ledger is oldest first, so the last match is the latest call.
        LastCall lastCall = null;
        for (TrackedCall c : calls) {
            if (c.ticker().equals(ticker)) lastCall = new LastCall(c.call(), c.confidence(), c.decidedAt());
        }
        return Optional.of(new Row(ticker, company, last.date(), last.close(), change, spark, lastCall));
    }
}
