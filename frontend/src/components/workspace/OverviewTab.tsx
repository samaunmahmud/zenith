import type { CommitteeState } from "../../state/committee";
import { reportList } from "../../state/committee";
import type { AgentModel } from "../../types";
import { ANALYSTS, ANALYST_TITLE } from "../../lib/format";
import { CommitteeFloor } from "../committee/CommitteeFloor";
import { Verdict, VerdictPlaceholder } from "../committee/Verdict";
import { KeyStats } from "../market/KeyStats";
import { NewsPanel } from "../market/NewsPanel";
import { PriceChart } from "../market/PriceChart";
import { StanceBadge } from "../ui/Badges";
import { Card } from "../ui/Card";

interface Props {
  state: CommitteeState;
  agents: AgentModel[];
  now: number;
  openTab: (tab: "analysts") => void;
}

/** One line per analyst: its call, confidence and headline, linking to the full reports. */
function AnalystSummary({ state, openTab }: Pick<Props, "state" | "openTab">) {
  const running = state.status === "running";
  return (
    <Card title="Analyst calls" actions={<button className="linkish" onClick={() => openTab("analysts")}>Full reports →</button>} flush>
      <dl className="kv">
        {ANALYSTS.map((a) => {
          const r = state.reports[a];
          return (
            <div key={a} style={{ display: "block" }}>
              <div className="row spread">
                <dt style={{ color: "var(--text)", fontWeight: 600 }}>{ANALYST_TITLE[a]}</dt>
                <dd className="row" style={{ gap: 8 }}>
                  {r ? (
                    <>
                      <span className="xs dim num">{Math.round(r.confidence * 100)}%</span>
                      <StanceBadge stance={r.stance} />
                    </>
                  ) : state.errors[a] ? (
                    <span className="xs neg">No valid report</span>
                  ) : (
                    <span className="xs dim">{running ? "Analysing…" : "Not run"}</span>
                  )}
                </dd>
              </div>
              {r && <p className="small muted" style={{ marginTop: 4 }}>{r.headline}</p>}
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

export function OverviewTab({ state, agents, now, openTab }: Props) {
  const s = state.snapshot;
  const running = state.status === "running";
  return (
    <div className="stack-16">
      <CommitteeFloor
        agents={agents}
        mode={running ? "running" : state.status === "error" ? "error" : "done"}
        stage={state.stage}
        timing={state.timing}
        now={now}
        digest={state.digest}
        reports={state.reports}
        errors={state.errors}
        decision={state.decision}
        chairError={state.result?.chairError ?? null}
        costs={state.result?.costs ?? null}
      />
      <div className="grid">
        <div className="col-8 stack-16">
          {state.decision ? (
            <Verdict decision={state.decision} reports={reportList(state)} />
          ) : running ? (
            <VerdictPlaceholder stage={state.stage} />
          ) : null}
          {s && (
            <Card title="Price" sub="1 year, daily closes with SMA50 and SMA200">
              <PriceChart points={s.priceHistory} currency={s.currency} />
            </Card>
          )}
        </div>
        <div className="col-4 stack-16">
          {s && <KeyStats snapshot={s} />}
          {(s || running) && <AnalystSummary state={state} openTab={openTab} />}
          {s && <NewsPanel digest={state.digest} news={state.news} />}
        </div>
      </div>
    </div>
  );
}
