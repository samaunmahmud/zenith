import { useEffect, useState } from "react";
import { searchSymbols } from "../../api";
import type { CommitteeState } from "../../state/committee";
import type { SymbolMatch } from "../../types";

interface Props {
  state: CommitteeState;
  onFile: string[];
  onConvene: (ticker: string) => void;
}

/**
 * A session that never got its market data: one clear card instead of an empty dashboard. For an unknown ticker it
 * searches what was typed as a company name too, so "SANDISK" offers SNDK.
 */
export function NoMarketData({ state, onFile, onConvene }: Props) {
  const unknown = state.errorStatus === 404;
  const [matches, setMatches] = useState<SymbolMatch[] | null>(unknown ? null : []);

  useEffect(() => {
    if (!unknown) return;
    const ctrl = new AbortController();
    searchSymbols(state.ticker, ctrl.signal).then((m) => !ctrl.signal.aborted && setMatches(m));
    return () => ctrl.abort();
  }, [state.ticker, unknown]);

  const others = onFile.filter((t) => t !== state.ticker);
  const title = unknown ? `No stock called ${state.ticker}` : state.errorStatus === 503 ? "The committee isn't taking new cases right now" : "Market data couldn't be loaded";
  const detail = unknown
    ? "Zenith looks stocks up by their US ticker symbol (for example MSFT, or BRK-B for Berkshire Hathaway class B)."
    : state.errorStatus === 503
      ? "Its AI budget for this demo is used up or switched off, so no Nemotron models were called. Stocks already on file still open for free."
      : state.error ?? "Please try again in a moment.";

  return (
    <main className="tx">
      <div className="container nodata">
        <section className="nodata-card" aria-labelledby="nodata-h">
          <span className="nodata-ic" aria-hidden="true">?</span>
          <h1 id="nodata-h">{title}</h1>
          <p className="nodata-detail">{detail}</p>

          {unknown && (
            <div className="nodata-block">
              <h2>Did you mean</h2>
              {matches === null ? (
                <p className="dim"><span className="spin-dots" aria-hidden="true"><i /><i /><i /></span> Searching company names…</p>
              ) : matches.length === 0 ? (
                <p className="dim">No US-listed company matches “{state.ticker.toLowerCase()}”.</p>
              ) : (
                <ul className="nodata-matches">
                  {matches.map((m) => (
                    <li key={m.symbol}>
                      <button type="button" onClick={() => onConvene(m.symbol)}>
                        <b className="num">{m.symbol}</b>
                        <span>{m.name}</span>
                        <span className="sg-ex">{m.exchange}</span>
                        <span className="nodata-go" aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {others.length > 0 && (
            <div className="nodata-block">
              <h2>Or open a stock on file</h2>
              <div className="quick">{others.map((t) => <button key={t} type="button" className="chip" onClick={() => onConvene(t)}>{t}</button>)}</div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
