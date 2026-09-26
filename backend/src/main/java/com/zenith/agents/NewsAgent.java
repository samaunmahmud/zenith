package com.zenith.agents;

import com.zenith.data.NewsItem;
import com.zenith.llm.CostTracker;
import com.zenith.llm.TokenFactoryClient;
import com.zenith.schema.NewsDigest;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Nano condenses raw headlines into a short digest the analysts can use. */
@Component
public class NewsAgent {

    private final TokenFactoryClient llm;

    public NewsAgent(TokenFactoryClient llm) {
        this.llm = llm;
    }

    public NewsDigest summarise(String ticker, List<NewsItem> news, CostTracker tracker) {
        if (news.isEmpty()) return null;
        String headlines = news.stream()
                .map(n -> "- [" + n.datetime().substring(0, Math.min(10, n.datetime().length())) + "] " + n.headline() + " (" + n.source() + ")")
                .collect(Collectors.joining("\n"));
        return llm.callStructured(new TokenFactoryClient.StructuredCall<>(
                Roster.NEWS_DESK.id(),
                Roster.NEWS_DESK.tier(),
                Prompts.load("news"),
                "Company: " + ticker + "\nHeadlines from the last two weeks:\n" + headlines,
                NewsDigest.class,
                0.2,
                tracker,
                null));
    }
}
