package com.zenith.cli;

import com.zenith.committee.CommitteeResult;
import com.zenith.committee.CommitteeService;
import com.zenith.config.ZenithProperties;
import com.zenith.data.MarketData;
import com.zenith.data.MarketDataService;
import com.zenith.llm.CallCost;
import com.zenith.llm.ChatTransport;
import com.zenith.llm.CostTracker;
import com.zenith.llm.ModelTier;
import com.zenith.llm.TokenFactoryClient;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * One-off tasks, run from the same jar:
 * <pre>
 *   java -jar zenith.jar --smoke                     call Nano, Super and Ultra once each, print tokens/latency/cost
 *   java -jar zenith.jar --precache                  cache market data for the demo tickers (or: --precache MSFT AMZN)
 *   java -jar zenith.jar --precache --committee      also run and save a full committee per ticker (demo replay)
 * </pre>
 */
@Component
public class CliTasks implements ApplicationRunner {

    private final TokenFactoryClient llm;
    private final MarketDataService marketData;
    private final CommitteeService committee;
    private final ZenithProperties props;

    public CliTasks(TokenFactoryClient llm, MarketDataService marketData, CommitteeService committee, ZenithProperties props) {
        this.llm = llm;
        this.marketData = marketData;
        this.committee = committee;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (args.containsOption("smoke")) smoke();
        else if (args.containsOption("precache")) precache(args.getNonOptionArgs(), args.containsOption("committee"));
    }

    private void smoke() {
        CostTracker tracker = new CostTracker();
        for (ModelTier tier : ModelTier.values()) {
            System.out.printf("%-5s %s ... ", tier.id(), llm.modelFor(tier));
            try {
                var result = llm.chat("smoke-" + tier.id(), tier,
                        List.of(new ChatTransport.Message("user", "In one sentence: what does an investment committee do?")),
                        0.3, 1024, null, tracker, 1);
                CallCost c = tracker.calls().get(result.costIndex());
                System.out.printf(Locale.ROOT, "ok (%d ms, %d+%d tokens, $%.6f)%n", c.latencyMs(), c.promptTokens(), c.completionTokens(), c.estimatedCostUsd());
                String reply = result.text().replaceAll("\\s+", " ");
                System.out.println("      → " + reply.substring(0, Math.min(200, reply.length())));
            } catch (RuntimeException e) {
                System.out.println("FAILED: " + e.getMessage());
            }
        }
        var s = tracker.summary();
        System.out.printf(Locale.ROOT, "%nTotal: %d tokens, $%.6f%n", s.totalPromptTokens() + s.totalCompletionTokens(), s.totalUsd());
    }

    private void precache(List<String> tickers, boolean withCommittee) {
        List<String> list = tickers.isEmpty() ? props.demoTickerList() : tickers.stream().map(String::toUpperCase).toList();
        System.out.println("Pre-caching " + String.join(", ", list) + (withCommittee ? " (with committee runs)" : "") + "\n");
        for (String ticker : list) {
            try {
                MarketData md = marketData.get(ticker);
                System.out.printf("✓ %s: %d price bars, %d headlines%n", ticker, md.prices().size(), md.news().size());
                if (withCommittee) {
                    CommitteeResult r = committee.run(ticker, true, e -> {});
                    System.out.printf(Locale.ROOT, "  committee: %s, %d/3 reports, $%.4f, %d integrity flag(s)%n",
                            r.decision() == null ? "no decision" : r.decision().recommendation(),
                            r.reports().size(), r.costs().totalUsd(), r.integrity().size());
                }
            } catch (RuntimeException e) {
                System.out.println("✗ " + ticker + ": " + e.getMessage());
            }
        }
    }
}
