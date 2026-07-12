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
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Ledger performance</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
            <Target className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Verified track record
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Computed only from resolved receipts. No LLM in this pipeline — every number below is a direct count of what happened vs what was predicted.
          </p>
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
          <Tile label="Resolved" value={String(tr.resolved_count)} sub={`${tr.graded_count} graded · ${tr.pending_review_count} pending review · ${tr.open_count} open`}/>
          <Tile
            label="Happened %"
            value={tr.base_rate == null ? "—" : `${Math.round(tr.base_rate * 100)}%`}
            sub={tr.base_rate == null ? "No graded predictions yet" : `${tr.happened_count} of ${tr.graded_count} graded`}
            color="var(--color-opportunity)"
          />
          <Tile
            label="Accuracy (Brier, first)"
            value={tr.mean_brier_first == null ? "—" : tr.mean_brier_first.toFixed(3)}
            sub={`Lower is better · coin-flip ${tr.coin_flip_brier.toFixed(2)}${tr.mean_brier_final != null ? ` · final ${tr.mean_brier_final.toFixed(3)}` : ""}`}
            color={tr.mean_brier_first != null && tr.mean_brier_first < tr.coin_flip_brier ? "var(--color-growth)" : "var(--color-reason)"}
          />
          <Tile
            label="Median lead vs mainstream"
            value={tr.median_lead_time_days == null ? "—" : `${tr.median_lead_time_days > 0 ? "+" : ""}${tr.median_lead_time_days.toFixed(1)}d`}
            sub={tr.lead_time_n > 0 ? `n=${tr.lead_time_n} · positive = Archlight first` : "No mainstream-matched happened events yet"}
            color={tr.median_lead_time_days != null && tr.median_lead_time_days > 0 ? "var(--color-growth)" : "var(--color-signal)"}
          />
          <Tile
            label="Called before any mainstream coverage"
            value={String(tr.before_mainstream_count)}
            sub={tr.before_mainstream_count > 0 ? "Exclusives — no mainstream outlet covered them" : "None yet"}
            color={tr.before_mainstream_count > 0 ? "var(--color-growth)" : undefined}
          />
        </div>

        {/* Calibration */}
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Calibration by stated probability</div>
          {tr.calibration.every((b) => b.n === 0) ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">No resolved predictions yet — the ledger settles as deadlines arrive.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>Stated range</Th><Th>N</Th><Th>Mean stated</Th><Th>Observed</Th><Th>Δ</Th></tr>
              </thead>
              <tbody>
                {tr.calibration.filter((b) => b.n > 0).map((b) => {
                  const delta = b.observed_rate - b.mean_predicted;
                  const deltaColor = Math.abs(delta) < 0.05 ? "var(--color-growth)" : Math.abs(delta) < 0.15 ? "var(--color-reason)" : "var(--color-risk)";
                  return (
                    <tr key={b.lo} className="border-t border-border/40">
                      <Td className="font-mono">[{b.lo.toFixed(1)}, {b.hi.toFixed(2)})</Td>
                      <Td className="font-mono">{b.n}</Td>
                      <Td className="font-mono">{(b.mean_predicted * 100).toFixed(0)}%</Td>
                      <Td className="font-mono">{(b.observed_rate * 100).toFixed(0)}%</Td>
                      <Td className="font-mono" style={{ color: deltaColor }}>{delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}pt</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

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
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{r.subject_kind}</span>
                      <OutcomeBadge outcome={r.outcome}/>
                      {r.observed_path && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest text-muted-foreground">{r.observed_path}</span>}
                      {r.horizon && <span className="text-[10px] font-mono text-muted-foreground">horizon · {r.horizon}</span>}
                      {r.resolved_by && <span className="text-[10px] font-mono text-muted-foreground">via · {r.resolved_by}</span>}
                      {r.brier_first != null && <span className="text-[10px] font-mono text-muted-foreground">brier · {Number(r.brier_first).toFixed(3)}</span>}
                      {r.lead_time_days != null && <span className="text-[10px] font-mono text-muted-foreground">lead · {Number(r.lead_time_days).toFixed(1)}d</span>}
                      <span className="text-[10px] font-mono text-muted-foreground"><LocalDate date={r.resolved_at} /></span>
                    </div>
                    <p className="text-sm mt-1.5">{r.prediction_text}</p>
                    {r.resolution_rationale && (
                      <p className="text-[11px] mt-1 text-muted-foreground"><span className="text-foreground/80">Rationale:</span> {r.resolution_rationale}</p>
                    )}
                  </div>
                  {r.event_candidate_id && (
                    <Link to="/events/$id" params={{ id: r.event_candidate_id }} className="text-[10px] font-mono text-[color:var(--color-signal)] hover:underline shrink-0">view event →</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

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
