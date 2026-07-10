import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { generateDigest, getLatestDigest, getDigestHistory } from "@/lib/archlight/precognition.functions";
import { Loader2, Newspaper, Radar, Sparkles, TriangleAlert, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/digest")({
  head: () => ({
    meta: [
      { title: "Archlight · Weekly precognition digest" },
      { name: "description", content: "Seven-day precognition digest: ranked risks, ranked opportunities, forward scenarios across four horizons, and why-it-matters for decision-makers." },
      { property: "og:title", content: "Archlight · Precognition digest" },
      { property: "og:description", content: "Ranked risks, opportunities and forward scenarios for the past seven days — hedged, evidence-grounded, no financial advice." },
    ],
  }),
  component: DigestPage,
});

type Event = { id: string; title: string; event_class: string; severity: string; risk_score: number; opportunity_score: number; confidence: number; affected_sector: string | null; affected_region: string | null; summary: string | null };
type Scenario = { id: string; horizon: string; scenario_label: string; narrative: string; probability: number; magnitude: string | null; affected_companies: string[]; affected_sectors: string[]; leading_indicators: string[]; confidence: number };

function DigestPage() {
  const qc = useQueryClient();
  const latest = useQuery({ queryKey: ["digest", "latest"], queryFn: () => getLatestDigest() });
  const history = useQuery({ queryKey: ["digest", "history"], queryFn: () => getDigestHistory() });
  const gen = useMutation({
    mutationFn: () => generateDigest(),
    onSuccess: () => { toast.success("Digest generated."); qc.invalidateQueries({ queryKey: ["digest"] }); },
    onError: (e) => toast.error("Digest failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const d = latest.data?.digest;
  const topRisks = (d?.top_risks ?? []) as Event[];
  const topOpps = (d?.top_opportunities ?? []) as Event[];
  const topScenarios = (d?.top_scenarios ?? []) as Scenario[];
  const ranked = (d?.ranked_events ?? []) as (Event & { _score?: number })[];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Weekly precognition</div>
            <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">Digest</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Seven-day rollup of ranked risks, ranked opportunities, and forward scenarios across four horizons — immediate (0-7d), near (8-30d), medium (1-3mo), strategic (3-12mo).</p>
          </div>
          <button onClick={() => gen.mutate()} disabled={gen.isPending} className="h-9 px-4 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50">
            {gen.isPending ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Generating…</span> : "Regenerate digest"}
          </button>
        </div>

        {!d && !latest.isLoading && (
          <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No digest yet. Click "Regenerate digest" to generate one from the last 7 days of scans.</div>
        )}

        {d && (
          <>
            <header className="glass-panel rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <Newspaper className="h-3.5 w-3.5"/> digest · <span suppressHydrationWarning>{new Date(d.window_start).toLocaleDateString()} → {new Date(d.window_end).toLocaleDateString()}</span> · model {d.model ?? "—"}
              </div>
              <h2 className="font-display text-xl mt-2">{d.headline}</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{d.summary}</p>
            </header>

            <div className="grid grid-cols-12 gap-5">
              <section className="col-span-12 lg:col-span-6 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TriangleAlert className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>
                  <h3 className="font-display text-sm">Top ranked risks</h3>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{topRisks.length}</span>
                </div>
                <ul className="space-y-2">
                  {topRisks.map((e) => <EventRow key={e.id} e={e} kind="risk"/>)}
                  {topRisks.length === 0 && <li className="text-xs text-muted-foreground italic py-3">No risks in window.</li>}
                </ul>
              </section>
              <section className="col-span-12 lg:col-span-6 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--color-opportunity)" }}/>
                  <h3 className="font-display text-sm">Top ranked opportunities</h3>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{topOpps.length}</span>
                </div>
                <ul className="space-y-2">
                  {topOpps.map((e) => <EventRow key={e.id} e={e} kind="opportunity"/>)}
                  {topOpps.length === 0 && <li className="text-xs text-muted-foreground italic py-3">No opportunities in window.</li>}
                </ul>
              </section>

              <section className="col-span-12 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                  <h3 className="font-display text-sm">Forward scenarios (ranked by probability)</h3>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{topScenarios.length}</span>
                </div>
                {topScenarios.length === 0 && <div className="text-xs text-muted-foreground italic py-3">No projected scenarios in window. Run a scan.</div>}
                <ul className="grid md:grid-cols-2 gap-3">
                  {topScenarios.map((s) => (
                    <li key={s.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">horizon · {s.horizon} · magnitude {s.magnitude ?? "—"}</div>
                          <div className="font-display text-sm mt-0.5">{s.scenario_label}</div>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--color-signal)]/40 text-[color:var(--color-signal)] shrink-0">p {Number(s.probability).toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{s.narrative}</p>
                      {(s.affected_companies ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {s.affected_companies.slice(0, 6).map((c) => (
                            <Link key={c} to="/companies/$name" params={{ name: encodeURIComponent(c) }} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 hover:bg-accent/40">◇ {c}</Link>
                          ))}
                        </div>
                      )}
                      {(s.leading_indicators ?? []).length > 0 && (
                        <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                          <span className="text-foreground/70">watch:</span> {s.leading_indicators.slice(0, 3).join(" · ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="col-span-12 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Radar className="h-4 w-4"/>
                  <h3 className="font-display text-sm">Full ranked feed</h3>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{ranked.length}</span>
                </div>
                <ol className="divide-y divide-border/40">
                  {ranked.slice(0, 20).map((e, i) => (
                    <li key={e.id} className="py-2 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-muted-foreground w-6">#{i+1}</span>
                      <Link to="/events/$id" params={{ id: e.id }} className="flex-1 text-xs hover:text-[color:var(--color-signal)] truncate">{e.title}</Link>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{e.event_class}</span>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--color-risk)" }}>R {Math.round(Number(e.risk_score)*100)}</span>
                      <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--color-opportunity)" }}>O {Math.round(Number(e.opportunity_score)*100)}</span>
                      <span className="text-[10px] font-mono shrink-0 text-muted-foreground">C {Math.round(Number(e.confidence)*100)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </>
        )}

        {(history.data?.digests?.length ?? 0) > 1 && (
          <section className="glass-panel rounded-xl p-4">
            <h3 className="font-display text-sm mb-2">Past digests</h3>
            <ul className="divide-y divide-border/40 text-xs">
              {history.data!.digests.slice(1).map((h) => (
                <li key={h.id} className="py-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground w-40 shrink-0" suppressHydrationWarning>{new Date(h.window_start).toLocaleDateString()} → {new Date(h.window_end).toLocaleDateString()}</span>
                  <span className="truncate">{h.headline}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Archlight surfaces public signals · no buy · no sell · no target price
        </div>
      </div>
    </AppShell>
  );
}

function EventRow({ e, kind }: { e: Event; kind: "risk" | "opportunity" }) {
  const color = kind === "risk" ? "var(--color-risk)" : "var(--color-opportunity)";
  const score = kind === "risk" ? Math.round(Number(e.risk_score) * 100) : Math.round(Number(e.opportunity_score) * 100);
  return (
    <li className="rounded-lg border border-border/50 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <Link to="/events/$id" params={{ id: e.id }} className="font-display text-sm hover:text-[color:var(--color-signal)] flex-1 min-w-0 truncate">{e.title}</Link>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0" style={{ borderColor: color, color }}>{kind === "risk" ? "R" : "O"} {score}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>{e.affected_sector ?? "—"}</span>
        <span>{e.affected_region ?? "—"}</span>
        <span>sev {e.severity}</span>
        <span>conf {Math.round(Number(e.confidence)*100)}</span>
      </div>
      {e.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.summary}</p>}
    </li>
  );
}
