import type { CommitteeState } from "../../state/committee";
import type { Tier } from "../../types";
import { usd } from "../../lib/format";
import { totalsAt } from "../../lib/tape";
import type { Playback } from "../../hooks/usePlayback";
import { Panel, TierTag } from "./Panel";

const TIERS: Tier[] = ["nano", "super", "ultra"];

/** What the session has cost so far, split by Nemotron tier, and what the same calls would cost all on Ultra. */
export function CostMeter({ state, play }: { state: CommitteeState; play: Playback }) {
  const tot = totalsAt(play.tape, play.t);
  const allUltra = state.result?.costs.allUltraUsd ?? null;
  const done = play.finished && state.result;
  const max = Math.max(...TIERS.map((k) => tot.byTier[k]), 1e-9);
  const pending = play.mode === "live" && !state.result;
  return (
    <Panel title="Committee cost" id="cst" className="cost-panel" meta={play.mode === "replay" ? "recorded when decided" : "Token Factory list prices"}>
      <div className="cost-top">
        <div className="cost-big num">{pending ? "…" : usd(tot.cost)}</div>
        <div className="cost-sub num">{tot.tokens.toLocaleString("en-GB")} tokens · {tot.calls} calls</div>
      </div>
      <ul className="cost-tiers">
        {TIERS.map((k) => (
          <li key={k}>
            <TierTag tier={k} />
            <span className="cbar"><i className={`tier-${k}`} style={{ width: `${(tot.byTier[k] / max) * 100}%` }} /></span>
            <span className="num">{pending ? "…" : usd(tot.byTier[k])}</span>
          </li>
        ))}
      </ul>
      {done && allUltra ? (
        <p className="cost-cmp num">Same calls all on Ultra: <b>{usd(allUltra)}</b> · tiering is <b className="pos">{(allUltra / Math.max(tot.cost, 1e-9)).toFixed(1)}× cheaper</b></p>
      ) : (
        <p className="cost-cmp dim">{pending ? "Token counts and cost arrive when the session closes." : "Counting as each call completes…"}</p>
      )}
    </Panel>
  );
}
