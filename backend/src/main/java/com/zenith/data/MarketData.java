package com.zenith.data;

import java.util.List;
import java.util.Map;

/**
 * Everything the committee needs for one ticker. Prices are oldest → newest. The FMP fundamentals
 * payloads are kept raw because their field names vary between API versions; mapping happens later.
 */
public record MarketData(
        String ticker,
        CompanyProfile profile,
        List<PriceBar> prices,
        List<PriceBar> benchmark,
        Map<String, Object> ratios,
        Map<String, Object> keyMetrics,
        Map<String, Object> growth,
        List<NewsItem> news,
        List<SourceInfo> sources) {}
