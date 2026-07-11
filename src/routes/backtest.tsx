import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/archlight/AppShell";
import { FlaskConical, ImportIcon, Play, RefreshCcw, Fingerprint, Radar, TimerReset } from "lucide-react";
import {
  computeBacktestSummary,
  getBacktestSummary,
  importGazetteCases,
  listBacktestCases,
  listRecentBacktestRuns,
  runBacktest,
} from "@/lib/archlight/backtest.functions";
import { computeCalibration, computeDistressProfiles, listSignatures, mineSignatures, resolveCohortNow } from "@/lib/archlight/signatures.functions";



const summaryQuery = queryOptions({
  queryKey: ["archlight", "backtest", "summary"],
  queryFn: () => getBacktestSummary(),
  staleTime: 30_000,
});
const casesQuery = queryOptions({
  queryKey: ["archlight", "backtest", "cases"],
  queryFn: () => listBacktestCases({ data: { limit: 200 } }),
  staleTime: 30_000,
});
const runsQuery = queryOptions({
  queryKey: ["archlight", "backtest", "runs"],
  queryFn: () => listRecentBacktestRuns({ data: { limit: 10 } }),
  staleTime: 30_000,
});
const signaturesQuery = queryOptions({
  queryKey: ["archlight", "signatures"],
  queryFn: () => listSignatures(),
  staleTime: 30_000,
});
const calibrationQuery = queryOptions({
  queryKey: ["archlight", "calibration"],
  queryFn: () => computeCalibration(),
  staleTime: 30_000,
});


export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Archlight · Backtest against known failures" },
      { name: "description", content: "Prove the lead time: match Companies House distress signals against The Gazette insolvency notices and count how many days earlier the warning showed up." },
      { property: "og:title", content: "Archlight · Backtest against known failures" },
      { property: "og:description", content: "Signals vs. outcomes. Real filings only. No spin." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(summaryQuery);
    context.queryClient.ensureQueryData(casesQuery);
    context.queryClient.ensureQueryData(runsQuery);
    context.queryClient.ensureQueryData(signaturesQuery);
    context.queryClient.ensureQueryData(calibrationQuery);
  },

  component: BacktestPage,
});

function BacktestPage() {
  const qc = useQueryClient();
  const { data: summary } = useSuspenseQuery(summaryQuery);
  const { data: casesData } = useSuspenseQuery(casesQuery);
  const { data: runsData } = useSuspenseQuery(runsQuery);
  const { data: sigData } = useSuspenseQuery(signaturesQuery);
  const { data: calibration } = useSuspenseQuery(calibrationQuery);
  const [banner, setBanner] = useState<string | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["archlight", "backtest"] });
    qc.invalidateQueries({ queryKey: ["archlight", "signatures"] });
    qc.invalidateQueries({ queryKey: ["archlight", "calibration"] });
  };


  const importM = useMutation({
    mutationFn: () => importGazetteCases(),
    onSuccess: (r) => { setBanner(`Imported ${r.imported} case(s) from ${r.considered} Gazette notice(s).`); invalidateAll(); },
    onError: (e: Error) => setBanner(`Import failed: ${e.message}`),
  });
  const runM = useMutation({
    mutationFn: () => runBacktest({ data: { maxCases: 15 } }),
    onSuccess: (r) => {
      setBanner(`Backtest: processed ${r.cases_processed} case(s), resolved ${r.cases_resolved}, inserted ${r.signals_inserted} signal(s).`);
      invalidateAll();
    },
    onError: (e: Error) => setBanner(`Backtest failed: ${e.message}`),
  });
  const recomputeM = useMutation({
    mutationFn: () => computeBacktestSummary(),
    onSuccess: () => { setBanner("Summary snapshot recorded."); invalidateAll(); },
    onError: (e: Error) => setBanner(`Recompute failed: ${e.message}`),
  });
  const mineM = useMutation({
    mutationFn: () => mineSignatures(),
    onSuccess: (r) => { setBanner(`Mined ${r.signal_types ?? 0} signature(s) across ${r.total_cases ?? 0} case(s).`); invalidateAll(); },
    onError: (e: Error) => setBanner(`Mine failed: ${e.message}`),
  });
  const profileM = useMutation({
    mutationFn: () => computeDistressProfiles({ data: { maxCompanies: 20 } }),
    onSuccess: (r) => { setBanner(`Distress profiles: checked ${r.companies_checked}, wrote ${r.profiles_written}, ${r.review_queue_added} raised for review.`); invalidateAll(); },
    onError: (e: Error) => setBanner(`Profile run failed: ${e.message}`),
  });
  const resolveM = useMutation({
    mutationFn: () => resolveCohortNow({ data: { maxChecks: 30 } }),
    onSuccess: (r) => { setBanner(`Cohort: checked ${r.checked}, failed ${r.failed}, survived ${r.survived}, still open ${r.still_open}.`); invalidateAll(); },
    onError: (e: Error) => setBanner(`Cohort resolution failed: ${e.message}`),
  });

  const busy = importM.isPending || runM.isPending || recomputeM.isPending || mineM.isPending || profileM.isPending || resolveM.isPending;

  const cases = casesData.cases;
  const runs = runsData.runs;
  const signatures = sigData.signatures;


  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Backtest harness</div>
            <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
              <FlaskConical className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Signals vs. known failures
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Ground truth: The Gazette corporate-insolvency notices. Distress signals: Companies House filing history, charges, and officer resignations dated before each outcome. Every number here comes from real fetched data.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBtn onClick={() => importM.mutate()} disabled={busy} icon={<ImportIcon className="h-3.5 w-3.5"/>} label={importM.isPending ? "Importing…" : "Import Gazette cases"}/>
            <ActionBtn onClick={() => runM.mutate()} disabled={busy} icon={<Play className="h-3.5 w-3.5"/>} label={runM.isPending ? "Running…" : "Run backtest"} accent/>
            <ActionBtn onClick={() => recomputeM.mutate()} disabled={busy} icon={<RefreshCcw className="h-3.5 w-3.5"/>} label={recomputeM.isPending ? "Recomputing…" : "Recompute summary"}/>
            <ActionBtn onClick={() => mineM.mutate()} disabled={busy} icon={<Fingerprint className="h-3.5 w-3.5"/>} label={mineM.isPending ? "Mining…" : "Mine signatures"}/>
            <ActionBtn onClick={() => profileM.mutate()} disabled={busy} icon={<Radar className="h-3.5 w-3.5"/>} label={profileM.isPending ? "Matching…" : "Match live companies"}/>
            <ActionBtn onClick={() => resolveM.mutate()} disabled={busy} icon={<TimerReset className="h-3.5 w-3.5"/>} label={resolveM.isPending ? "Resolving…" : "Resolve cohort"}/>
          </div>


        </div>

        {banner && (
          <div className="glass-panel rounded-md px-3 py-2 text-xs font-mono text-muted-foreground">{banner}</div>
        )}

        {/* Headline tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Known outcomes" value={String(summary.cases_total)} sub={summary.cases_with_signal > 0 ? `${summary.cases_with_signal} with ≥1 signal` : "Import to begin"}/>
          <Tile
            label="Signal appeared before collapse"
            value={summary.cases_with_signal_pct == null ? "—" : `${summary.cases_with_signal_pct}%`}
            sub={`${summary.cases_with_signal} of ${summary.cases_total}`}
            color={summary.cases_with_signal_pct != null && summary.cases_with_signal_pct >= 50 ? "var(--color-growth)" : "var(--color-signal)"}
          />
          <Tile
            label="Median lead"
            value={summary.median_lead_days == null ? "—" : `${Math.round(Number(summary.median_lead_days))}d`}
            sub={summary.earliest_lead_days_max != null ? `earliest seen · ${summary.earliest_lead_days_max}d` : "Run the backtest to populate"}
            color="var(--color-signal)"
          />
          <Tile
            label="Most predictive signal"
            value={summary.most_predictive_type ? formatType(summary.most_predictive_type.type) : "—"}
            sub={summary.most_predictive_type ? `${Math.round(summary.most_predictive_type.median_lead_days)}d median lead` : "Awaiting signals"}
            color="var(--color-opportunity)"
          />
        </div>

        {/* Per-signal-type breakdown */}
        {Object.keys(summary.signal_type_stats).length > 0 && (
          <section className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Signal type breakdown</div>
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>Signal</Th><Th>Cases</Th><Th>Occurrences</Th><Th>Median lead</Th></tr>
              </thead>
              <tbody>
                {Object.entries(summary.signal_type_stats).map(([t, v]) => (
                  <tr key={t} className="border-t border-border/40">
                    <Td>{formatType(t)}</Td>
                    <Td className="font-mono">{v.cases}</Td>
                    <Td className="font-mono">{v.count}</Td>
                    <Td className="font-mono">{v.median_lead_days == null ? "—" : `${Math.round(v.median_lead_days)}d`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Mined signatures — recall among known failures */}
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40 flex items-center justify-between">
            <span className="flex items-center gap-2"><Fingerprint className="h-3.5 w-3.5"/>Mined distress signatures</span>
            <span className="text-muted-foreground/70">Recall among known failures · not a probability</span>
          </div>
          {signatures.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">
              No signatures yet. Run the backtest, then click <span className="text-foreground">Mine signatures</span>.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>Signal</Th><Th>Prevalence in failures</Th><Th>Median lead</Th><Th>Sample</Th><Th>Mined</Th></tr>
              </thead>
              <tbody>
                {signatures.map((s) => (
                  <tr key={s.signal_type} className="border-t border-border/40">
                    <Td>{formatType(s.signal_type)}</Td>
                    <Td className="font-mono">{Math.round(Number(s.prevalence_in_failures) * 100)}%</Td>
                    <Td className="font-mono">{s.median_lead_days == null ? "—" : `${Math.round(Number(s.median_lead_days))}d`}</Td>
                    <Td className="font-mono">n={s.sample_size}</Td>
                    <Td className="font-mono text-muted-foreground">{new Date(s.mined_at).toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Calibration — prospective, accruing */}
        <CalibrationPanel calibration={calibration}/>




        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40 flex items-center justify-between">
            <span>Cases · {cases.length}</span>
            <span className="text-muted-foreground/70">Earliest signal per case</span>
          </div>
          {cases.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">
              No cases yet. Click <span className="text-foreground">Import Gazette cases</span> to seed known outcomes, then <span className="text-foreground">Run backtest</span> to check filings.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30 sticky top-0">
                  <tr><Th>Company</Th><Th>Outcome date</Th><Th>Earliest signal</Th><Th>Lead</Th><Th>Signal types</Th><Th>Computed</Th></tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-t border-border/40">
                      <Td>
                        <div className="font-medium">{c.company_name}</div>
                        {c.company_number && <div className="text-[10px] font-mono text-muted-foreground">{c.company_number}</div>}
                      </Td>
                      <Td className="font-mono">{c.outcome_date}</Td>
                      <Td className="font-mono">{c.earliest_signal_date ?? "—"}</Td>
                      <Td className="font-mono" style={{ color: c.earliest_lead_days != null ? "var(--color-growth)" : undefined }}>
                        {c.earliest_lead_days != null ? `${c.earliest_lead_days}d` : "—"}
                      </Td>
                      <Td>
                        <div className="flex gap-1 flex-wrap">
                          {c.signal_types.length === 0 && <span className="text-[10px] font-mono text-muted-foreground italic">no signals</span>}
                          {c.signal_types.map((t) => (
                            <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{formatType(t)}</span>
                          ))}
                        </div>
                      </Td>
                      <Td className="font-mono text-muted-foreground">{c.signals_computed_at ? new Date(c.signals_computed_at).toLocaleDateString() : "pending"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent runs */}
        {runs.length > 0 && (
          <section className="glass-panel rounded-xl overflow-hidden">
            <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Recent snapshots</div>
            <table className="w-full text-xs">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
                <tr><Th>Ran</Th><Th>Cases</Th><Th>With signal</Th><Th>Median lead</Th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <Td className="font-mono">{new Date(r.ran_at).toLocaleString()}</Td>
                    <Td className="font-mono">{r.cases_total ?? 0}</Td>
                    <Td className="font-mono">{r.cases_with_signal ?? 0}</Td>
                    <Td className="font-mono">{r.median_lead_days == null ? "—" : `${Math.round(Number(r.median_lead_days))}d`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Archlight surfaces public signals · no buy · no sell · no target price
        </div>
      </div>
    </AppShell>
  );
}

function ActionBtn({ onClick, disabled, icon, label, accent }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11px] border transition disabled:opacity-50 disabled:cursor-not-allowed ${
        accent
          ? "border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10"
          : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40"
      }`}
    >
      {icon}{label}
    </button>
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

function formatType(t: string): string {
  switch (t) {
    case "charge_registered": return "Charge registered";
    case "insolvency_filing": return "Insolvency filing";
    case "officer_resignation": return "Officer resigned";
    case "news_mention": return "News mention";
    default: return t;
  }
}
