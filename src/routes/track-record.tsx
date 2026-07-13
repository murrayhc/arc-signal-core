import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { computeTrackRecord, recentResolutions, recentTrackRecordSnapshots } from "@/lib/archlight/track-record.functions";
import { Target } from "lucide-react";
import { useEffect, useState } from "react";

const trackRecordQuery = queryOptions({
  queryKey: ["archlight", "track-record"],
  queryFn: () => computeTrackRecord(),
  staleTime: 30_000,
});
const resolutionsQuery = queryOptions({
  queryKey: ["archlight", "track-record", "resolutions"],
  queryFn: () => recentResolutions({ data: { limit: 20 } }),
  staleTime: 30_000,
});
const snapshotsQuery = queryOptions({
  queryKey: ["archlight", "track-record", "snapshots"],
  queryFn: () => recentTrackRecordSnapshots({ data: { limit: 30 } }),
  staleTime: 60_000,
});

export const Route = createFileRoute("/track-record")({
  head: () => ({
    meta: [
      { title: "Archlight · Verified track record" },
      { name: "description", content: "Hard-data ledger of resolved predictions: base rate, Brier accuracy vs coin-flip, calibration by decile, mean lead time, and every recent verdict with rationale." },
      { property: "og:title", content: "Archlight · Verified track record" },
      { property: "og:description", content: "No spin, no LLM. Just what the ledger says." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(trackRecordQuery);
    context.queryClient.ensureQueryData(resolutionsQuery);
    context.queryClient.ensureQueryData(snapshotsQuery);
  },
  component: TrackRecordPage,
});

function LocalDate({ date }: { date: string | null }) {
  const [formatted, setFormatted] = useState("");
  useEffect(() => {
    if (date) setFormatted(new Date(date).toLocaleString());
  }, [date]);
  return <span>{formatted}</span>;
}

function TrackRecordPage() {
  const { data: tr } = useSuspenseQuery(trackRecordQuery);
  const { data: res } = useSuspenseQuery(resolutionsQuery);
  const { data: snaps } = useSuspenseQuery(snapshotsQuery);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Proof</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 flex items-center gap-3">
            <Target className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Track record
          </h1>
          <div className="mt-3 rounded-lg border border-border/60 bg-accent/20 p-3 text-sm max-w-3xl">
            <span className="font-medium">In plain terms:</span> <span className="text-muted-foreground">when Archlight commits to a probability, this page checks what really happened — and by how many days it beat mainstream coverage. Higher hit rate and longer lead are better. Every call is frozen when it's made, so it can't be edited after the fact.</span>
          </div>
          <div className="mt-3">
            <Link
              to="/opportunities"
              className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/60 w-fit"
            >
              See current openings →
            </Link>
          </div>
        </div>

        {/* Headline tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Tile label="Resolved calls" value={String(tr.resolved_count)} sub={`${tr.graded_count} graded · ${tr.pending_review_count} pending review · ${tr.open_count} open`}/>
          <Tile
            label="Hit rate"
            value={tr.base_rate == null ? "—" : `${Math.round(tr.base_rate * 100)}%`}
            sub={tr.base_rate == null ? "No graded predictions yet" : `${tr.happened_count} of ${tr.graded_count} graded`}
            color="var(--color-opportunity)"
          />
          <Tile
            label="Brier score"
            value={tr.mean_brier_first == null ? "—" : tr.mean_brier_first.toFixed(3)}
            sub={`Lower is better · coin-flip ${tr.coin_flip_brier.toFixed(2)}${tr.mean_brier_final != null ? ` · final ${tr.mean_brier_final.toFixed(3)}` : ""}`}
            color={tr.mean_brier_first != null && tr.mean_brier_first < tr.coin_flip_brier ? "var(--color-growth)" : "var(--color-reason)"}
          />
          <Tile
            label="Median lead"
            value={tr.median_lead_time_days == null ? "—" : `${tr.median_lead_time_days > 0 ? "+" : ""}${tr.median_lead_time_days.toFixed(1)}d`}
            sub={tr.lead_time_n > 0 ? `n=${tr.lead_time_n} · positive = Archlight first` : "No mainstream-matched happened events yet"}
            color={tr.median_lead_time_days != null && tr.median_lead_time_days > 0 ? "var(--color-growth)" : "var(--color-signal)"}
          />
          <Tile
            label="Called before press"
            value={String(tr.before_mainstream_count)}
            sub={tr.before_mainstream_count > 0 ? "Exclusives — no mainstream outlet covered them" : "None yet"}
            color={tr.before_mainstream_count > 0 ? "var(--color-growth)" : undefined}
          />
        </div>

        {/* Calibration — visual chart */}
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <div className="font-display text-sm">When Archlight says X%, does X% happen?</div>
            <div className="text-xs text-muted-foreground mt-0.5">Each row groups calls by the confidence stated; a well-calibrated tool lands close to the line.</div>
          </div>
          {tr.calibration.every((b) => b.n === 0) ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">No resolved predictions yet — the ledger settles as deadlines arrive.</div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--color-opportunity)" }}/>What actually happened</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5" style={{ background: "var(--color-signal)" }}/>What Archlight said</span>
              </div>
              <div className="space-y-2.5">
                {tr.calibration.filter((b) => b.n > 0).map((b) => {
                  const obsPct = Math.max(0, Math.min(100, b.observed_rate * 100));
                  const predPct = Math.max(0, Math.min(100, b.mean_predicted * 100));
                  return (
                    <div key={b.lo} className="grid grid-cols-[80px_1fr_140px] items-center gap-3">
                      <div className="text-xs font-mono">{Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%</div>
                      <div className="relative h-5 rounded bg-accent/30 overflow-hidden">
                        <div className="absolute inset-y-0 left-0" style={{ width: `${obsPct}%`, background: "var(--color-opportunity)", opacity: 0.75 }}/>
                        <div className="absolute inset-y-0 w-0.5" style={{ left: `calc(${predPct}% - 1px)`, background: "var(--color-signal)" }}/>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground text-right">said {Math.round(predPct)}% · got {Math.round(obsPct)}% · n={b.n}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Recent resolutions */}
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Recent resolutions</div>
          {res.resolutions.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground italic">No resolved predictions yet — the ledger settles as deadlines arrive.</div>
          )}
          <ul className="divide-y divide-border/40">
            {res.resolutions.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <VerdictBadge outcome={r.outcome}/>
                      {r.lead_time_days != null && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {Number(r.lead_time_days) > 0 ? `+${Number(r.lead_time_days).toFixed(1)}d ahead of mainstream` : `${Number(r.lead_time_days).toFixed(1)}d vs mainstream`}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1.5">{r.prediction_text}</p>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      called · {r.outcome ?? "—"}{r.resolved_at ? " · " : ""}<LocalDate date={r.resolved_at} />
                    </div>
                    {r.resolution_rationale && (
                      <p className="text-[11px] mt-1 text-muted-foreground"><span className="text-foreground/80">Rationale:</span> {r.resolution_rationale}</p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap opacity-70">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest text-muted-foreground">{r.subject_kind}</span>
                      {r.observed_path && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest text-muted-foreground">{r.observed_path}</span>}
                      {r.horizon && <span className="text-[10px] font-mono text-muted-foreground">horizon · {r.horizon}</span>}
                      {r.resolved_by && <span className="text-[10px] font-mono text-muted-foreground">via · {r.resolved_by}</span>}
                      {r.brier_first != null && <span className="text-[10px] font-mono text-muted-foreground">brier · {Number(r.brier_first).toFixed(3)}</span>}
                    </div>
                  </div>
                  {r.event_candidate_id && (
                    <Link to="/events/$id" params={{ id: r.event_candidate_id }} className="text-[10px] font-mono text-[color:var(--color-signal)] hover:underline shrink-0">view event →</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex items-center gap-3 pt-2">
          <div className="flex-1 h-px bg-border/40"/>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">More detail</div>
          <div className="flex-1 h-px bg-border/40"/>
        </div>

        {/* Scenario breakdown */}
        {tr.scenario_count > 0 && (
          <section className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Scenarios · {tr.scenario_count} graded · mean Brier {tr.scenario_mean_brier != null ? tr.scenario_mean_brier.toFixed(3) : "—"}</div>
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>Horizon</Th><Th>N</Th><Th>Happened</Th><Th>Rate</Th></tr>
              </thead>
              <tbody>
                {Object.entries(tr.by_horizon).map(([h, v]) => (
                  <tr key={h} className="border-t border-border/40">
                    <Td className="font-mono">{h}</Td>
                    <Td className="font-mono">{v.n}</Td>
                    <Td className="font-mono">{v.happened}</Td>
                    <Td className="font-mono">{v.n ? `${Math.round((v.happened / v.n) * 100)}%` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Snapshot trend */}
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Snapshot trend</div>
          {snaps.snapshots.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground italic">Snapshots accumulate one per scan run.</div>
          )}
          {snaps.snapshots.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>When</Th><Th>Resolved</Th><Th>Happened %</Th><Th>Mean Brier (first)</Th><Th>Pending review</Th><Th>Open</Th></tr>
              </thead>
              <tbody>
                {snaps.snapshots.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <Td className="font-mono"><LocalDate date={s.created_at} /></Td>
                    <Td className="font-mono">{s.resolved_count}</Td>
                    <Td className="font-mono">{s.base_rate == null ? "—" : `${Math.round(Number(s.base_rate) * 100)}%`}</Td>
                    <Td className="font-mono">{s.mean_brier_first == null ? "—" : Number(s.mean_brier_first).toFixed(3)}</Td>
                    <Td className="font-mono">{s.pending_review_count}</Td>
                    <Td className="font-mono">{s.open_count}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Archlight surfaces public signals · no buy · no sell · no target price
        </div>
      </div>
    </AppShell>
  );
}


function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-display text-2xl mt-1" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-[10px] font-mono text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="text-left px-3 py-2">{children}</th>; }
function Td({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) { return <td className={`px-3 py-2 align-top ${className ?? ""}`} style={style}>{children}</td>; }
function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const c = outcome === "happened" ? "var(--color-growth)"
    : outcome === "did_not_happen" ? "var(--color-risk)"
    : outcome === "unresolvable" ? "var(--color-muted-foreground)"
    : "var(--color-signal)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{outcome ?? "—"}</span>;
}
function VerdictBadge({ outcome }: { outcome: string | null }) {
  const label = outcome === "happened" ? "Right" : outcome === "did_not_happen" ? "Missed" : (outcome ?? "—");
  const c = outcome === "happened" ? "var(--color-growth)"
    : outcome === "did_not_happen" ? "var(--color-risk)"
    : "var(--color-muted-foreground)";
  return <span className="text-[11px] font-mono px-2 py-0.5 rounded-md uppercase tracking-widest" style={{ background: `color-mix(in oklab, ${c} 15%, transparent)`, color: c, border: `1px solid ${c}` }}>{label}</span>;
}

