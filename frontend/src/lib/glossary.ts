/**
 * Plain-English definitions for the metrics the analysts cite, so a visitor who doesn't trade
 * can still follow the argument. Matched against the backend's labels ("P/E (TTM)", "RSI (14)").
 * Order matters: the first match wins, so specific patterns come before general ones.
 */
const ENTRIES: [RegExp, string][] = [
  [/^price vs sma\s?(\d+)/i, "How far the price sits above (+) or below (−) its average over the last $1 trading days."],
  [/^sma\s?(\d+)/i, "Simple moving average: the average closing price over the last $1 trading days. Smooths out day-to-day noise."],
  [/^rsi/i, "Relative Strength Index, 0–100. Measures how strong recent gains are against recent losses. Above 70 is often read as overbought, below 30 as oversold."],
  [/^macd histogram/i, "The gap between the MACD line and its signal line. Positive and growing suggests upward momentum is building."],
  [/^macd signal/i, "A 9-day average of the MACD line. MACD crossing above it is a common bullish signal."],
  [/^macd/i, "Moving Average Convergence Divergence: the 12-day minus the 26-day exponential average of price. Tracks momentum."],
  [/^distance from 52-week high/i, "How far the price is below its highest close of the past year."],
  [/^distance from 52-week low/i, "How far the price is above its lowest close of the past year."],
  [/^52-week (high|low)/i, "The $1est closing price over the past year."],
  [/^forward p\/e/i, "Price divided by analysts' expected earnings per share for the next year."],
  [/^p\/e/i, "Price-to-earnings: the share price divided by the last twelve months' earnings per share. Higher means investors pay more for each dollar of profit."],
  [/^peg/i, "P/E divided by the earnings growth rate. Around 1 suggests the price is in line with growth; well below 1 can mean cheap for its growth."],
  [/^price\/sales/i, "Market value divided by the last twelve months' revenue. Useful when a company has little or no profit."],
  [/^price\/book/i, "Market value divided by the company's net assets on its balance sheet."],
  [/^ev\/ebitda/i, "Enterprise value (market value plus debt, minus cash) divided by earnings before interest, tax, depreciation and amortisation. A valuation measure that ignores how the company is financed."],
  [/^gross margin/i, "The share of revenue left after the direct cost of making what was sold."],
  [/^operating margin/i, "The share of revenue left after all operating costs, before interest and tax."],
  [/^net margin/i, "The share of revenue left as profit after every cost, interest and tax."],
  [/^return on equity/i, "Net profit divided by shareholders' equity: how much profit the company makes with the money owners have put in."],
  [/^debt\/equity/i, "Total debt divided by shareholders' equity. Higher means the company leans more on borrowing."],
  [/^current ratio/i, "Short-term assets divided by short-term liabilities. Below 1 means bills due within a year exceed what can quickly be turned into cash."],
  [/^free cash flow yield/i, "Cash left after running and investing in the business, as a share of market value."],
  [/^dividend yield/i, "Dividends paid over the last year as a share of the current price."],
  [/^revenue growth/i, "Year-on-year change in revenue for the last completed fiscal year."],
  [/^eps growth/i, "Year-on-year change in earnings per share for the last completed fiscal year."],
  [/volatility/i, "How much the price swings, as the annualised standard deviation of daily returns. The S&P 500 is usually 12–20%."],
  [/^beta/i, "How much the stock tends to move when the S&P 500 moves 1%. Above 1 amplifies the market; below 1 dampens it."],
  [/^max drawdown/i, "The largest fall from a peak to a later low over the period: the worst loss a buyer at the top would have sat through."],
  [/dollar volume/i, "The average value of shares traded per day. Higher means large orders can be filled without moving the price."],
  [/daily volume/i, "The average number of shares traded per day over the last 20 trading days."],
  [/^market cap/i, "Share price times shares outstanding: what the market values the whole company at."],
  [/^\d+-(week|month|year) return/i, "The change in price over the period, excluding dividends."],
];

const TTM = " TTM means trailing twelve months: the last four reported quarters.";

/** The definition for a metric label, or null if it needs none. */
export function define(label: string): string | null {
  for (const [re, text] of ENTRIES) {
    const m = re.exec(label.trim());
    if (m) return text.replace("$1", (m[1] ?? "").toLowerCase()) + (/\bTTM\b/.test(label) ? TTM : "");
  }
  return null;
}
