import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getEventDetail } from "@/lib/archlight/pipeline.functions";
import { getEventScenarios, projectEventForward } from "@/lib/archlight/precognition.functions";
import { getEventPredictions } from "@/lib/archlight/outcome.functions";
import { ArrowLeft, Building2, ExternalLink, FileText, GitBranch, Loader2, Radar, ShieldAlert, Sparkles, Target, TriangleAlert, Zap } from "lucide-react";
import { ForensicReport } from "@/components/archlight/ForensicReport";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$id")({
  head: () => ({
    meta: [
      { title: "Archlight · Event interrogation report" },
      { name: "description", content: "Traceable event report: evidence IDs, claim confidence, source lineage, contradictions, impacts, opportunity logic and hedged positioning." },
      { property: "og:title", content: "Archlight · Event interrogation report" },
      { property: "og:description", content: "From source to claim to consequence — with lineage, confidence and contradiction notes." },
    ],
  }),
  component: EventDetailPage,
});

type SupportingClaim = {
  id: string;
  claim_text: string;
  claim_type: string;
  factuality_label: string | null;
  extraction_confidence: number | null;
  specificity_score: number | null;
  canonical_claim_id: string | null;
  canonical_text: string | null;
  canonical_reliability: number | null;
  canonical_repeat_count: number | null;
  canonical_independent_sources: number | null;
  canonical_factuality: string | null;
  source_id: string;
  source_name: string | null;
  document_url: string | null;
  lineage: Array<{ source_name: string | null; url: string | null; published_at: string | null; relation: string | null; is_likely_copy: boolean | null; origin_confidence: number | null }>;
};

function EventDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["archlight", "event", id],
    queryFn: () => getEventDetail({ data: { id } }),
  });
  const scen = useQuery({
    queryKey: ["archlight", "event", id, "scenarios"],
    queryFn: () => getEventScenarios({ data: { id } }),
    enabled: !!data?.event,
  });
  const preds = useQuery({
    queryKey: ["archlight", "event", id, "predictions"],
    queryFn: () => getEventPredictions({ data: { eventId: id } }),
    enabled: !!data?.event,
  });
  const projectMut = useMutation({
    mutationFn: () => projectEventForward({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Projected forward: ${r.scenarios_created} scenarios, ${r.propagated_impacts} propagated impacts.`);
      qc.invalidateQueries({ queryKey: ["archlight", "event", id] });
    },
    onError: (e) => toast.error("Projection failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const claimsById = useMemo(() => {
    const m = new Map<string, SupportingClaim>();
    (data?.supporting_claims as SupportingClaim[] | undefined)?.forEach((c) => m.set(c.id, c));
    return m;
  }, [data]);

  const shortId = (s: string) => s.slice(0, 8);
  const propagated = (data?.impacts ?? []).filter((i) => (i.metadata as { propagated?: boolean } | null)?.propagated);
  const primaryImpacts = (data?.impacts ?? []).filter((i) => !(i.metadata as { propagated?: boolean } | null)?.propagated);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-3.5 w-3.5"/> Back
        </button>

        {isLoading && (
          <div className="glass-panel rounded-xl p-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin"/>Loading event…
          </div>
        )}
        {error && <div className="glass-panel rounded-xl p-6 text-sm text-[color:var(--color-risk)]">Failed to load event.</div>}
        {data && !data.event && <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Event not found.</div>}

        {data?.event && (
          <>
            <header className="glass-panel rounded-xl p-5">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <Radar className="h-3.5 w-3.5"/> event candidate · {data.event.event_class} · {data.event.status} · <span className="text-foreground/70">EVT-{shortId(data.event.id)}</span>
              </div>
              <h1 className="font-display text-2xl mt-1">{data.event.title}</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{data.event.summary}</p>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                <Metric k="Risk" v={pct(data.event.risk_score)} c="var(--color-risk)"/>
                <Metric k="Opportunity" v={pct(data.event.opportunity_score)} c="var(--color-opportunity)"/>
                <Metric k="Probability" v={pct(data.event.probability)}/>
                <Metric k="Confidence" v={pct(data.event.confidence)} c="var(--color-signal)"/>
                <Metric k="Evidence" v={String(data.event.evidence_count)}/>
                <Metric k="Src diversity" v={Number(data.event.source_diversity_score).toFixed(2)}/>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="px-2 py-1 rounded border border-border/60">sector · {data.event.affected_sector ?? "—"}</span>
                <span className="px-2 py-1 rounded border border-border/60">region · {data.event.affected_region ?? "—"}</span>
                <span className="px-2 py-1 rounded border border-border/60">severity · {data.event.severity}</span>
                <span className="px-2 py-1 rounded border border-border/60">type · {data.event.event_type}</span>
                <span className="px-2 py-1 rounded border border-border/60">supporting claims · {data.supporting_claims.length}</span>
                <span className="px-2 py-1 rounded border border-border/60">contradictions · {data.contradictions.length}</span>
                <span className="px-2 py-1 rounded border border-border/60">propagated impacts · {propagated.length}</span>
                <button onClick={() => projectMut.mutate()} disabled={projectMut.isPending} className="ml-auto h-7 px-3 rounded-md text-[10px] border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50">
                  {projectMut.isPending ? "Projecting…" : (scen.data?.scenarios?.length ? "Re-project" : "Project forward")}
                </button>
              </div>
            </header>

            <ForensicReport subjectType="event" subjectId={data.event.id} title={data.event.title} />



            {/* Contradictions banner */}
            {data.contradictions.length > 0 && (
              <section className="glass-panel rounded-xl p-4 border-l-2" style={{ borderLeftColor: "var(--color-risk)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <TriangleAlert className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>
                  <h2 className="font-display text-sm">Contradiction notes</h2>
                  <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">flagged for review</span>
                </div>
                <ul className="space-y-1.5">
                  {data.contradictions.map((c) => (
                    <li key={c.id} className="text-xs flex gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0 mt-0.5">CTR-{shortId(c.id)}</span>
                      <span className="text-foreground/90">{c.reason}</span>
                      <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">{c.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Forward scenarios */}
            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                <h2 className="font-display text-sm">Forward scenarios</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {scen.data?.scenarios?.length ?? 0} projected
                </span>
              </div>
              {(!scen.data?.scenarios?.length) && (
                <Empty>No forward projection yet. Click "Project forward" above to generate scenarios across immediate (0-7d), near (8-30d), medium (1-3mo), and strategic (3-12mo) horizons.</Empty>
              )}
              {(scen.data?.scenarios?.length ?? 0) > 0 && scen.data && (
                <div className="grid md:grid-cols-2 gap-3">
                  {scen.data.scenarios.map((s) => <ScenarioCard key={s.id} s={s as ScenarioRow} label={scen.data.horizon_labels?.[s.horizon as keyof typeof scen.data.horizon_labels] ?? s.horizon}/>)}
                </div>
              )}
            </section>

            {/* Predictions ledger */}
            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                <h2 className="font-display text-sm">Predictions</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {preds.data?.predictions?.length ?? 0} receipt{(preds.data?.predictions?.length ?? 0) === 1 ? "" : "s"} · frozen at scan time
                </span>
              </div>
              {(!preds.data?.predictions?.length) && (
                <Empty>No receipts frozen for this event yet — they are created at the end of the scan that produced the event.</Empty>
              )}
              {(preds.data?.predictions?.length ?? 0) > 0 && (
                <ul className="space-y-2">
                  {preds.data!.predictions.map((p) => (
                    <li key={p.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{p.subject_kind}</span>
                          {p.horizon && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest text-muted-foreground">{p.horizon}</span>}
                          <PredictionStatusBadge status={p.status} outcome={p.outcome}/>
                          {p.resolved_by && <span className="text-[10px] font-mono text-muted-foreground">via · {p.resolved_by}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                          <span className="px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">stated {pct(p.predicted_probability)}%</span>
                          <span className="px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">live {pct(p.final_probability)}%</span>
                          <span className="text-muted-foreground">by {new Date(p.deadline).toISOString().slice(0, 10)}</span>
                        </div>
                      </div>
                      <p className="text-sm mt-2">{p.prediction_text}</p>
                      {p.resolution_rationale && (
                        <p className="text-[11px] mt-1 text-muted-foreground"><span className="text-foreground/80">Rationale:</span> {p.resolution_rationale}</p>
                      )}
                      {p.brier_first != null && (
                        <div className="mt-1 text-[10px] font-mono text-muted-foreground">brier · {Number(p.brier_first).toFixed(3)}{p.lead_time_days != null ? ` · lead ${Number(p.lead_time_days).toFixed(1)}d` : ""}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Propagated impacts */}
            {propagated.length > 0 && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="h-4 w-4" style={{ color: "var(--color-reason)" }}/>
                  <h2 className="font-display text-sm">Propagated impacts (peer / supplier / competitor graph)</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{propagated.length}</span>
                </div>
                <ul className="grid md:grid-cols-2 gap-2">
                  {propagated.map((im) => {
                    const meta = (im.metadata ?? {}) as { relationship_type?: string; decay?: number };
                    return (
                      <li key={im.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Link to="/companies/$name" params={{ name: encodeURIComponent(im.company_name) }} className="font-display text-sm hover:text-[color:var(--color-signal)]">{im.company_name}</Link>
                          <ImpactTag t={im.impact_type}/>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{im.impact_pathway}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          <span>via · {meta.relationship_type ?? "peer"}</span>
                          {meta.decay != null && <span>decay {Number(meta.decay).toFixed(2)}</span>}
                          <span>risk {pct(im.risk_score)}</span>
                          <span>opp {pct(im.opportunity_score)}</span>
                          <span>conf {pct(im.confidence)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Evidence ledger */}
            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                <h2 className="font-display text-sm">Evidence ledger</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.supporting_claims.length} atomic claims</span>
              </div>
              {data.supporting_claims.length === 0 && <Empty>No atomic claims linked. Run a scan to populate evidence.</Empty>}
              <ul className="space-y-2">
                {(data.supporting_claims as SupportingClaim[]).map((c) => (
                  <EvidenceRow key={c.id} c={c} shortId={shortId}/>
                ))}
              </ul>
            </section>

            <div className="grid grid-cols-12 gap-5">
              <section className="col-span-12 lg:col-span-6 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4" style={{ color: "var(--color-opportunity)" }}/>
                  <h2 className="font-display text-sm">Company impacts</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.impacts.length}</span>
                </div>
                {data.impacts.length === 0 && <Empty>No company impacts synthesized.</Empty>}
                <ul className="space-y-2">
                  {data.impacts.map((im) => (
                    <li key={im.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-display text-sm">{im.company_name}</div>
                        <ImpactTag t={im.impact_type}/>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{im.impact_pathway}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        <span>risk {pct(im.risk_score)}</span>
                        <span>opp {pct(im.opportunity_score)}</span>
                        <span>conf {pct(im.confidence)}</span>
                      </div>
                      {(im.watch_signals ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {im.watch_signals.map((w: string, i: number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border/50">◇ {w}</span>
                          ))}
                        </div>
                      )}
                      {(im.evidence_ids ?? []).length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/30">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">evidence</div>
                          <div className="flex flex-wrap gap-1">
                            {(im.evidence_ids as string[]).map((eid) => {
                              const cl = claimsById.get(eid);
                              return (
                                <a key={eid} href={`#claim-${eid}`} title={cl?.claim_text ?? eid} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--color-signal)]/40 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10">
                                  EV-{shortId(eid)}
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="col-span-12 lg:col-span-6 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--color-opportunity)" }}/>
                  <h2 className="font-display text-sm">Opportunity cards</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.opportunities.length}</span>
                </div>
                {data.opportunities.length === 0 && <Empty>No commercial angle synthesized for this event.</Empty>}
                <ul className="space-y-2">
                  {data.opportunities.map((op) => (
                    <li key={op.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-display text-sm">{op.title}</div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--color-opportunity)", color: "var(--color-opportunity)" }}>
                          val {pct(op.commercial_value_score)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{op.summary}</p>
                      {op.buyer_pain && <p className="text-[11px] mt-1"><span className="text-foreground/80">Buyer pain:</span> {op.buyer_pain}</p>}
                      {op.suggested_offer && <p className="text-[11px] mt-1"><span className="text-foreground/80">Suggested offer:</span> {op.suggested_offer}</p>}
                      {op.next_best_action && <p className="text-[11px] mt-1"><span className="text-foreground/80">Next best action:</span> {op.next_best_action}</p>}
                      {op.opportunity_logic && <p className="text-[11px] text-muted-foreground mt-1"><span className="text-foreground/80">Logic:</span> {op.opportunity_logic}</p>}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="col-span-12 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="h-4 w-4" style={{ color: "var(--color-reason)" }}/>
                  <h2 className="font-display text-sm">Strategic positioning examples</h2>
                  <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">not financial advice</span>
                </div>
                {data.positioning.length === 0 && <Empty>No positioning example generated.</Empty>}
                <ul className="grid md:grid-cols-2 gap-3">
                  {data.positioning.map((p) => (
                    <li key={p.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                      <div className="font-display text-sm">{p.title}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{p.user_type} · conf {pct(p.confidence)}</div>
                      <p className="text-xs mt-2"><span className="text-foreground/80">Angle:</span> {p.positioning_angle}</p>
                      <p className="text-xs mt-1"><span className="text-foreground/80">How it could be used:</span> {p.how_it_could_be_used}</p>
                      <p className="text-xs mt-1"><span className="text-foreground/80">Why it may matter:</span> {p.why_it_may_matter}</p>
                      {p.constraints && <p className="text-[11px] text-muted-foreground mt-1"><span className="text-foreground/80">Constraints:</span> {p.constraints}</p>}
                      {p.evidence_summary && <p className="text-[11px] text-muted-foreground mt-1"><span className="text-foreground/80">Evidence:</span> {p.evidence_summary}</p>}
                    </li>
                  ))}
                </ul>
              </section>

              <section className="col-span-12 glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Radar className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                  <h2 className="font-display text-sm">Evidence arc</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.arc.nodes.length} nodes · {data.arc.edges.length} edges</span>
                </div>
                {data.arc.nodes.length === 0 && <Empty>No graph traced yet. Run a scan.</Empty>}
                <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(data.arc.nodes as Array<{ id: string; node_type: string; title: string; summary: string | null; confidence: number; risk_score: number; opportunity_score: number }>).map((n) => (
                    <li key={n.id} className="rounded border border-border/40 p-2 bg-background/30">
                      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        <span>{n.node_type}</span>
                        <span>conf {Number(n.confidence).toFixed(2)}</span>
                      </div>
                      <div className="text-xs mt-1 truncate">{n.title}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Archlight surfaces public signals · no buy · no sell · no target price ·{" "}
              <Link to="/interrogate" className="underline">interrogate related</Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function EvidenceRow({ c, shortId }: { c: SupportingClaim; shortId: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const factColor = c.factuality_label === "supported"
    ? "var(--color-opportunity)"
    : c.factuality_label === "contested"
      ? "var(--color-risk)"
      : c.factuality_label === "weak_single_source"
        ? "var(--color-reason)"
        : "var(--color-muted-foreground)";
  return (
    <li id={`claim-${c.id}`} className="rounded-lg border border-border/50 bg-background/30 p-3 scroll-mt-24">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--color-signal)]/40 text-[color:var(--color-signal)] shrink-0">EV-{shortId(c.id)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground/90">{c.claim_text}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>type · {c.claim_type}</span>
            <span>conf · {c.extraction_confidence != null ? Number(c.extraction_confidence).toFixed(2) : "—"}</span>
            <span>specificity · {c.specificity_score != null ? Number(c.specificity_score).toFixed(2) : "—"}</span>
            <span style={{ color: factColor }}>◆ {c.factuality_label ?? "unclassified"}</span>
            {c.source_name && <span>src · {c.source_name}</span>}
            {c.canonical_repeat_count != null && <span>repeats · {c.canonical_repeat_count}</span>}
            {c.canonical_independent_sources != null && <span>indep src · {c.canonical_independent_sources}</span>}
            {c.canonical_reliability != null && <span>rel · {Number(c.canonical_reliability).toFixed(2)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {c.document_url && (
            <a href={c.document_url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ExternalLink className="h-3 w-3"/> doc
            </a>
          )}
          {c.lineage.length > 0 && (
            <button onClick={() => setOpen((v) => !v)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3"/> lineage · {c.lineage.length}
            </button>
          )}
        </div>
      </div>
      {open && c.lineage.length > 0 && (
        <div className="mt-3 pl-6 border-l border-border/40">
          {c.canonical_text && c.canonical_text !== c.claim_text && (
            <div className="text-[11px] text-muted-foreground mb-2 italic">Canonical: “{c.canonical_text}”</div>
          )}
          <ol className="space-y-1.5">
            {c.lineage.map((l, i) => (
              <li key={i} className="text-[11px] flex flex-wrap items-baseline gap-x-2">
                <span className="text-[10px] font-mono text-muted-foreground">{l.published_at ? new Date(l.published_at).toISOString().slice(0, 10) : "—"}</span>
                <span className="font-display text-xs">{l.source_name ?? "unknown source"}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: l.relation === "origin_candidate" ? "var(--color-opportunity)" : l.is_likely_copy ? "var(--color-risk)" : "var(--color-muted-foreground)" }}>
                  {l.relation ?? "unknown"}{l.is_likely_copy ? " · likely copy" : ""}
                </span>
                {l.origin_confidence != null && <span className="text-[10px] font-mono text-muted-foreground">orig-conf {Number(l.origin_confidence).toFixed(2)}</span>}
                {l.url && (
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <ExternalLink className="h-3 w-3"/> link
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function Metric({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="rounded-md border border-border/50 p-2 bg-background/30">
      <div className="font-display text-lg leading-none" style={c ? { color: c } : undefined}>{v}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{k}</div>
    </div>
  );
}
function ImpactTag({ t }: { t: string }) {
  const color = t === "beneficiary" ? "var(--color-opportunity)" : t === "harmed" ? "var(--color-risk)" : "var(--color-muted-foreground)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0" style={{ borderColor: color, color }}>{t}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-muted-foreground italic py-4 text-center">{children}</div>;
}
function pct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}`;
}

type ScenarioRow = {
  id: string;
  horizon: string;
  scenario_label: string;
  narrative: string;
  mechanism: string | null;
  probability: number;
  magnitude: string | null;
  affected_companies: string[];
  affected_sectors: string[];
  affected_regions: string[];
  affected_cohorts: string[];
  leading_indicators: string[];
  contradicting_signals: string[];
  confidence: number;
};

function ScenarioCard({ s, label }: { s: ScenarioRow; label: string }) {
  const magColor =
    s.magnitude === "systemic" || s.magnitude === "severe" ? "var(--color-risk)" :
    s.magnitude === "material" ? "var(--color-reason)" :
    "var(--color-muted-foreground)";
  return (
    <div className="rounded-lg border border-border/50 bg-background/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">horizon · {s.horizon} · {label}</div>
          <div className="font-display text-sm mt-0.5">{s.scenario_label}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[color:var(--color-signal)]/40 text-[color:var(--color-signal)]">p {Number(s.probability).toFixed(2)}</span>
          {s.magnitude && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: magColor, color: magColor }}>{s.magnitude}</span>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{s.narrative}</p>
      {s.mechanism && <p className="text-[11px] mt-2"><span className="text-foreground/70">mechanism · </span>{s.mechanism}</p>}
      {(s.affected_companies ?? []).length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">affected companies</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {s.affected_companies.slice(0, 8).map((c) => (
              <Link key={c} to="/companies/$name" params={{ name: encodeURIComponent(c) }} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 hover:bg-accent/40">◇ {c}</Link>
            ))}
          </div>
        </div>
      )}
      {(s.affected_cohorts ?? []).length > 0 && (
        <div className="mt-2 text-[10px] font-mono text-muted-foreground">
          <span className="text-foreground/70">cohorts:</span> {s.affected_cohorts.join(" · ")}
        </div>
      )}
      {(s.leading_indicators ?? []).length > 0 && (
        <div className="mt-2 text-[10px] font-mono text-muted-foreground">
          <span className="text-foreground/70">watch for:</span> {s.leading_indicators.slice(0, 4).join(" · ")}
        </div>
      )}
      {(s.contradicting_signals ?? []).length > 0 && (
        <div className="mt-1 text-[10px] font-mono text-muted-foreground">
          <span className="text-foreground/70">would contradict:</span> {s.contradicting_signals.slice(0, 3).join(" · ")}
        </div>
      )}
    </div>
  );
}
