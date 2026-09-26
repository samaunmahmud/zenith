import type { NewsDigest, NewsItem } from "../../types";
import { ago, safeUrl } from "../../lib/format";
import { Card } from "../ui/Card";

const SENTIMENT_TONE = { positive: "bullish", negative: "bearish", mixed: "neutral", none: "" } as const;

/** The news desk's digest (Nemotron Nano) above the raw headlines it read. */
export function NewsPanel({ ticker, digest, news }: { ticker: string; digest: NewsDigest | null | undefined; news: NewsItem[] }) {
  const sentiment = digest?.sentiment ?? "none";
  return (
    <Card
      title="News desk"
      sub={news.length ? `${news.length} headlines` : undefined}
      actions={digest && sentiment !== "none" ? <span className={`badge ${SENTIMENT_TONE[sentiment]}`}>{sentiment}</span> : undefined}
      flush
    >
      <div className="card-body" style={{ paddingBottom: news.length ? 12 : 16 }}>
        {digest === undefined ? (
          <p className="small dim">The news desk reports once the market data is in.</p>
        ) : digest && (digest.themes.length > 0 || digest.notableEvents.length > 0) ? (
          <div className="stack">
            {digest.themes.length > 0 && <div className="themes">{digest.themes.map((t) => <span className="theme" key={t}>{t}</span>)}</div>}
            {digest.notableEvents.length > 0 && (
              <ul className="events">{digest.notableEvents.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </div>
        ) : news.length > 0 ? (
          // The feed tags articles that merely mention the ticker; the desk is told to ignore those.
          <p className="small dim">None of these headlines is really about {ticker}, so the desk had nothing to report.</p>
        ) : (
          <p className="small dim">No recent headlines to digest.</p>
        )}
      </div>
      {news.length > 0 && (
        <ul className="news-list" aria-label="Headlines the desk read">
          {news.slice(0, 4).map((n, i) => {
            const href = safeUrl(n.url);
            return (
            <li key={i}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer noopener">{n.headline}</a>
              ) : (
                <span>{n.headline}</span>
              )}
              <div className="src">{n.source}{n.datetime && ` · ${ago(n.datetime)}`}</div>
            </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
