import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getCompanyDeep } from "@/lib/archlight/precognition.functions";
import { getEntityDistressProfile } from "@/lib/archlight/signatures.functions";
import { getRegistryEdges, rebuildRegistryGraph } from "@/lib/archlight/registry.functions";
import { getBeliefState } from "@/lib/archlight/beliefs.functions";
import { Activity, ArrowDown, ArrowLeft, ArrowUp, Building2, CheckCircle2, Fingerprint, GitBranch, Landmark, Loader2, Minus, Radar, RefreshCw, Sparkles, TriangleAlert, Users, Zap } from "lucide-react";



export const Route = createFileRoute("/companies/$name")({
  head: ({ params }) => ({
    meta: [
      { title: `Archlight · ${decodeURIComponent(params.name)}` },
      { name: "description", content: `Precognition profile for ${decodeURIComponent(params.name)}: net risk vs opportunity, event exposure, propagation network, forward scenarios across four horizons.` },
      { property: "og:title", content: `Archlight · ${decodeURIComponent(params.name)}` },
      { property: "og:description", content: "Public-signal exposure, peer network, and forward scenarios." },
    ],
  }),
  component: CompanyDetailPage,
});

function CompanyDetailPage() {
  const { name } = Route.useParams();
  const decoded = decodeURIComponent(name);
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["archlight", "company", "deep", decoded],
    queryFn: () => getCompanyDeep({ data: { name: decoded } }),
  });
  const entityId = data?.entity?.id as string | undefined;
  const { data: distress } = useQuery({
    queryKey: ["archlight", "distress-profile", entityId],
    queryFn: () => getEntityDistressProfile({ data: { entityId: entityId! } }),
    enabled: !!entityId,
  });
  const { data: registry } = useQuery({
    queryKey: ["archlight", "registry-edges", entityId],
    queryFn: () => getRegistryEdges({ data: { entityId: entityId! } }),
    enabled: !!entityId,
  });
  const qc = useQueryClient();
  const rebuild = useMutation({
    mutationFn: () => rebuildRegistryGraph({ data: { maxCompanies: 20 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["archlight", "registry-edges"] });
      qc.invalidateQueries({ queryKey: ["archlight", "company", "deep"] });
    },
  });



  const propagatedImpacts = (data?.impacts ?? []).filter((i) => (i.metadata as { propagated?: boolean } | null)?.propagated);
  const primaryImpacts = (data?.impacts ?? []).filter((i) => !(i.metadata as { propagated?: boolean } | null)?.propagated);

  const scenariosByHorizon = (data?.scenarios ?? []).reduce<Record<string, NonNullable<typeof data>["scenarios"]>>((acc, s) => {
    (acc[s.horizon] ??= []).push(s);
    return acc;
  }, {});
  const horizonOrder = ["immediate", "near", "medium", "strategic"] as const;
  const horizonLabel: Record<(typeof horizonOrder)[number], string> = { immediate: "0-7 days", near: "8-30 days", medium: "1-3 months", strategic: "3-12 months" };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-3.5 w-3.5"/>Back
        </button>

        <header className="glass-panel rounded-xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Building2 className="h-3 w-3"/> company exposure profile
          </div>
          <h1 className="font-display text-2xl mt-1">{decoded}</h1>
          {data?.entity && (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {data.entity.ticker && <span className="px-2 py-1 rounded border border-border/60">ticker · {data.entity.ticker}</span>}
              {data.entity.sector && <span className="px-2 py-1 rounded border border-border/60">sector · {data.entity.sector}</span>}
              {data.entity.region && <span className="px-2 py-1 rounded border border-border/60">region · {data.entity.region}</span>}
              {(data.entity.aliases ?? []).slice(0, 3).map((a: string) => <span key={a} className="px-2 py-1 rounded border border-border/60">alias · {a}</span>)}
            </div>
          )}
          {data?.exposure && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              <Metric k="Net risk" v={pct(data.exposure.net_risk)} c="var(--color-risk)"/>
              <Metric k="Net opportunity" v={pct(data.exposure.net_opportunity)} c="var(--color-opportunity)"/>
              <Metric k="Weighted confidence" v={pct(data.exposure.weighted_confidence)} c="var(--color-signal)"/>
              <Metric k="Events" v={String(data.exposure.event_count)}/>
              <Metric k="Peers linked" v={String(data.related?.length ?? 0)}/>
            </div>
          )}
          {!data?.entity && data && !isLoading && (
            <div className="mt-2 text-[11px] text-muted-foreground italic">Not in canonical entity index — showing raw impact history only. Add to entities table to enable propagation.</div>
          )}
        </header>

        {isLoading && (
          <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading exposure profile…</div>
        )}

        {data && (
          <>
            {/* Distress signal profile — pattern match against known UK failures */}
            {distress?.profile && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Fingerprint className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>
                  <h2 className="font-display text-sm">Distress signal profile</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                    updated {new Date(distress.profile.computed_at).toLocaleDateString()}
                  </span>
                </div>
                {(() => {
                  const matched = (distress.profile.matched_types ?? []) as Array<{ type: string; date: string; historical_median_lead: number | null }>;
                  const score = Number(distress.profile.profile_score ?? 0);
                  const scorePct = Math.round(score * 100);
                  const totalSigs = distress.total_signatures;
                  const sampleN = distress.sample_size;
                  const color = score >= 0.66 ? "var(--color-risk)" : score >= 0.34 ? "var(--color-signal)" : "var(--color-growth)";
                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-md border border-border/50 p-3 bg-background/30">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Pattern match</div>
                          <div className="font-display text-3xl mt-1" style={{ color }}>{scorePct}%</div>
                          <div className="text-[10px] font-mono text-muted-foreground mt-1">
                            shows {matched.length} of {totalSigs} signals common in failed companies
                          </div>
                        </div>
                        <div className="md:col-span-2 rounded-md border border-border/50 p-3 bg-background/30">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Matched signals</div>
                          {matched.length === 0 ? (
                            <div className="text-xs text-muted-foreground italic mt-2">
                              No distress signals detected in the last {distress.profile.window_months} months.
                            </div>
                          ) : (
                            <ul className="mt-2 space-y-1.5">
                              {matched.map((m) => (
                                <li key={m.type} className="flex items-baseline justify-between gap-3 text-xs">
                                  <span>{formatSignalType(m.type)}</span>
                                  <span className="font-mono text-muted-foreground">
                                    {m.date}
                                    {m.historical_median_lead != null && (
                                      <span className="ml-2 text-[color:var(--color-signal)]">
                                        · historical median lead {Math.round(m.historical_median_lead)}d
                                      </span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 text-[11px] text-muted-foreground italic border-t border-border/40 pt-2">
                        Pattern match against {sampleN} known UK failures — a leading indicator, not a probability. Calibrated failure rates require a survivor control group (planned).
                      </div>
                    </>
                  );
                })()}
              </section>
            )}

            {/* Ownership & control — Companies House registry-verified edges */}
            {entityId && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Landmark className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                  <h2 className="font-display text-sm">Ownership & control — Companies House</h2>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {(registry?.outgoing.length ?? 0) + (registry?.incoming.length ?? 0)} verified
                    </span>
                    <button
                      onClick={() => rebuild.mutate()}
                      disabled={rebuild.isPending}
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[10px] font-mono uppercase tracking-widest border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition disabled:opacity-50"
                    >
                      {rebuild.isPending
                        ? <><Loader2 className="h-3 w-3 animate-spin"/>rebuilding…</>
                        : <><RefreshCw className="h-3 w-3"/>rebuild registry graph</>}
                    </button>
                  </span>
                </div>
                {!registry && <div className="text-xs text-muted-foreground italic">Loading registry edges…</div>}
                {registry && (registry.outgoing.length + registry.incoming.length === 0) && (
                  <div className="text-xs text-muted-foreground italic">
                    No registry-verified edges yet. Rebuild pulls Persons with Significant Control and shared officers from Companies House.
                  </div>
                )}
                {registry && (registry.outgoing.length + registry.incoming.length > 0) && (
                  <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <RegistryColumn
                      title="Controlled by (incoming)"
                      rows={registry.incoming.filter((r) => r.relationship_type === "controls")}
                      arrow="←"
                    />
                    <RegistryColumn
                      title="Controls (outgoing)"
                      rows={registry.outgoing.filter((r) => r.relationship_type === "controls")}
                      arrow="→"
                    />
                    <RegistryColumn
                      title="Shared directors"
                      rows={[
                        ...registry.outgoing.filter((r) => r.relationship_type === "shared_officer"),
                        ...registry.incoming.filter((r) => r.relationship_type === "shared_officer"),
                      ]}
                      arrow="↔"
                    />
                  </div>
                )}
                {rebuild.data && (
                  <div className="mt-3 text-[10px] font-mono text-muted-foreground border-t border-border/40 pt-2">
                    Last rebuild — checked {rebuild.data.companies_checked}, PSC edges {rebuild.data.psc_edges},
                    shared-officer edges {rebuild.data.shared_officer_edges}, numbers resolved {rebuild.data.numbers_resolved}.
                  </div>
                )}
              </section>
            )}



            {/* Forward scenarios grouped by horizon */}

            {(data.scenarios ?? []).length > 0 && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
                  <h2 className="font-display text-sm">Forward scenarios where {decoded} appears</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.scenarios.length}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {horizonOrder.map((h) => {
                    const rows = (scenariosByHorizon[h] ?? []).filter((s) => (s.affected_companies ?? []).some((c: string) => c.toLowerCase().includes(decoded.toLowerCase())));
                    if (!rows.length) return null;
                    return (
                      <div key={h} className="rounded-lg border border-border/50 bg-background/30 p-3">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">horizon · {h} · {horizonLabel[h]}</div>
                        <ul className="mt-2 space-y-2">
                          {rows.slice(0, 3).map((s) => (
                            <li key={s.id}>
                              <div className="text-xs font-display">{s.scenario_label}</div>
                              <div className="text-[10px] font-mono text-muted-foreground">p {Number(s.probability).toFixed(2)} · {s.magnitude ?? "—"}</div>
                              <p className="text-[11px] text-muted-foreground mt-1">{s.narrative}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                {horizonOrder.every((h) => !((scenariosByHorizon[h] ?? []).some((s) => (s.affected_companies ?? []).some((c: string) => c.toLowerCase().includes(decoded.toLowerCase()))))) && (
                  <div className="text-[11px] text-muted-foreground italic">No forward scenario explicitly names {decoded} yet.</div>
                )}
              </section>
            )}

            {/* Peer / supplier / competitor network */}
            {(data.related?.length ?? 0) > 0 && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4"/>
                  <h2 className="font-display text-sm">Relationship network</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.related.length}</span>
                </div>
                <ul className="grid md:grid-cols-3 gap-2">
                  {data.related.map((r) => (
                    <li key={`${r.id}-${r.relationship_type}-${r.direction}`} className="rounded border border-border/40 bg-background/30 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link to="/companies/$name" params={{ name: encodeURIComponent(r.canonical_name) }} className="text-xs font-display hover:text-[color:var(--color-signal)] truncate">{r.canonical_name}</Link>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50">{r.relationship_type}</span>
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex gap-2">
                        <span>{r.direction === "outgoing" ? "→" : "←"} w {Number(r.weight).toFixed(2)}</span>
                        {r.ticker && <span>{r.ticker}</span>}
                        {r.sector && <span>{r.sector}</span>}
                      </div>
                      {r.rationale && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{r.rationale}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Primary impact pathways */}
            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TriangleAlert className="h-4 w-4"/>
                <h2 className="font-display text-sm">Primary impact pathways</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{primaryImpacts.length}</span>
              </div>
              {primaryImpacts.length === 0 && <div className="text-xs text-muted-foreground italic py-4 text-center">No primary pathways recorded.</div>}
              <ul className="space-y-2">
                {primaryImpacts.map((im) => (
                  <li key={im.id} className="rounded border border-border/40 bg-background/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">{im.impact_pathway}</div>
                      <ImpactTag t={im.impact_type}/>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <span>risk {pct(im.risk_score)}</span>
                      <span>opp {pct(im.opportunity_score)}</span>
                      <span>conf {pct(im.confidence)}</span>
                      {im.event_candidate_id && <Link to="/events/$id" params={{ id: im.event_candidate_id }} className="underline hover:text-foreground">view event →</Link>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Propagated impacts */}
            {propagatedImpacts.length > 0 && (
              <section className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="h-4 w-4" style={{ color: "var(--color-reason)" }}/>
                  <h2 className="font-display text-sm">Propagated exposures (arrived via peer / supplier graph)</h2>
                  <span className="ml-auto text-[10px] font-mono text-muted-foreground">{propagatedImpacts.length}</span>
                </div>
                <ul className="grid md:grid-cols-2 gap-2">
                  {propagatedImpacts.map((im) => {
                    const meta = (im.metadata ?? {}) as { relationship_type?: string; decay?: number };
                    return (
                      <li key={im.id} className="rounded border border-border/40 bg-background/30 p-3">
                        <div className="text-sm">{im.impact_pathway}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          <span>via · {meta.relationship_type ?? "peer"}</span>
                          {meta.decay != null && <span>decay {Number(meta.decay).toFixed(2)}</span>}
                          <span>risk {pct(im.risk_score)}</span>
                          <span>opp {pct(im.opportunity_score)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Related events */}
            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Radar className="h-4 w-4"/>
                <h2 className="font-display text-sm">Related events</h2>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{data.events.length}</span>
              </div>
              <ul className="grid md:grid-cols-2 gap-2">
                {data.events.map((e) => (
                  <li key={e.id} className="rounded border border-border/40 bg-background/30 p-3">
                    <Link to="/events/$id" params={{ id: e.id }} className="block hover:text-[color:var(--color-signal)]">
                      <div className="font-display text-sm">{e.title}</div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {e.event_class} · sev {e.severity} · risk {pct(e.risk_score)} · opp {pct(e.opportunity_score)} · conf {pct(e.confidence)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Archlight surfaces public signals · no buy · no sell · no target price
        </div>
      </div>
    </AppShell>
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
function pct(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}`;
}
function formatSignalType(t: string): string {
  switch (t) {
    case "charge_registered": return "Charge registered";
    case "insolvency_filing": return "Insolvency filing";
    case "officer_resignation": return "Officer resigned";
    default: return t;
  }
}

interface RegistryRow {
  entity_id: string;
  canonical_name: string;
  company_number: string | null;
  relationship_type: string;
  weight: number;
  rationale: string | null;
  natures: string[];
  direction: "outgoing" | "incoming";
}
function RegistryColumn({ title, rows, arrow }: { title: string; rows: RegistryRow[]; arrow: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/30 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      {rows.length === 0 && <div className="text-[11px] text-muted-foreground italic">None.</div>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={`${r.entity_id}-${r.relationship_type}-${r.direction}`} className="rounded border border-border/40 bg-background/40 p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground">{arrow}</span>
              <Link
                to="/companies/$name"
                params={{ name: encodeURIComponent(r.canonical_name) }}
                className="text-xs font-display hover:text-[color:var(--color-signal)] truncate"
              >
                {r.canonical_name}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: "color-mix(in oklch, var(--color-signal) 18%, transparent)", color: "var(--color-signal)", border: "1px solid color-mix(in oklch, var(--color-signal) 40%, transparent)" }}
              >
                <CheckCircle2 className="h-2.5 w-2.5"/>registry-verified
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">w {r.weight.toFixed(2)}</span>
              {r.company_number && <span className="text-[10px] font-mono text-muted-foreground">no {r.company_number}</span>}
            </div>
            {r.natures.length > 0 && r.relationship_type === "controls" && (
              <div className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
                {r.natures.slice(0, 3).map((n) => n.replace(/-/g, " ")).join(" · ")}
              </div>
            )}
            {r.rationale && r.relationship_type !== "controls" && (
              <div className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{r.rationale}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

