import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateUK } from "@/lib/format-datetime";
import { getForensicReport, runForensicAnalysis, type ForensicReport } from "@/lib/archlight/forensic.functions";
import { Loader2, RefreshCw, Sparkles, TrendingDown, TrendingUp, AlertTriangle, Clock, Target, GitBranch, Radar, Scale, History, ShieldQuestion, Info, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

interface Props {
  subjectType: "opportunity" | "event";
  subjectId: string;
  title: string;
  autoRun?: boolean;
}

interface CachedShape {
  report: {
    id: string;
    status: string;
    model: string | null;
    report: ForensicReport | null;
    confidence: number | null;
    updated_at: string;
    notes: string | null;
  } | null;
  cached: boolean;
  age_ms: number | null;
  fresh: boolean;
}

const STAGES = [
  "Assembling underlying evidence…",
  "Mapping causal chain and exposure…",
  "Sourcing historical precedents…",
  "Sizing base/bear/bull cases…",
  "Extracting bull & bear triggers…",
  "Stress-testing contrarian view…",
  "Compiling forensic report…",
];

export function ForensicReport({ subjectType, subjectId, title, autoRun = true }: Props) {
  const qc = useQueryClient();
  const [stage, setStage] = useState(0);
  const autoRef = useRef(false);

  const { data, isLoading } = useQuery<CachedShape>({
    queryKey: ["archlight", "forensic", subjectType, subjectId],
    queryFn: () => getForensicReport({ data: { subject_type: subjectType, subject_id: subjectId } }) as Promise<CachedShape>,
  });

  const gen = useMutation({
    mutationFn: async (force: boolean) => {
      setStage(0);
      const timer = window.setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 4500);
      try {
        const r = await runForensicAnalysis({ data: { subject_type: subjectType, subject_id: subjectId, force } });
        return r;
      } finally {
        window.clearInterval(timer);
      }
    },
    onSuccess: (r) => {
      if (!r.ok) { toast.error("Forensic analysis failed", { description: r.error }); return; }
      qc.invalidateQueries({ queryKey: ["archlight", "forensic", subjectType, subjectId] });
    },
    onError: (e) => toast.error("Forensic analysis failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const rawReport = data?.report?.report as ForensicReport | Record<string, unknown> | null | undefined;
  const report = normalizeReport(rawReport);
  const reportNeedsRefresh = !!rawReport && !isCurrentReport(rawReport);
  const cachedAge = data?.age_ms != null ? Math.round(data.age_ms / (60 * 60 * 1000)) : null;
  const fresh = !!data?.fresh;
  const updatedAt = data?.report?.updated_at;

  // Auto-run once when no cached report exists
  useEffect(() => {
    if (!autoRun || autoRef.current) return;
    if (isLoading) return;
    if (data && !rawReport && !gen.isPending) {
      autoRef.current = true;
      gen.mutate(false);
    }
  }, [autoRun, isLoading, data, rawReport, gen]);

  return (
    <section className="glass-panel rounded-xl p-5 border-l-2" style={{ borderLeftColor: "var(--color-signal)" }}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles className="h-4 w-4 mt-1 shrink-0" style={{ color: "var(--color-signal)" }} />
          <div className="min-w-0">
            <h2 className="font-display text-base md:text-lg text-glow-signal">Forensic Analysis</h2>
            <p className="text-[11px] text-muted-foreground max-w-2xl">
              A guided journey from headline to positioning. Institutional-grade rigor, hedged, grounded in traceable public evidence. Not financial advice.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {report && (
            <span className="text-[10px] font-mono px-2 py-1 rounded border border-border/60 text-muted-foreground" title={updatedAt ?? ""}>
              {fresh ? "cached · fresh" : cachedAge != null ? `cached · ${cachedAge}h old` : "cached"}
            </span>
          )}
          {report && (
            <button
              onClick={() => gen.mutate(true)}
              disabled={gen.isPending}
              className="h-8 px-3 rounded-md text-xs border border-border/60 hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
            >
              {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
            </button>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</div>
      )}

      {gen.isPending && (
        <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
          <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Building forensic report for <span className="font-medium">{title}</span></div>
          <ul className="mt-3 space-y-1 text-xs font-mono">
            {STAGES.map((s, i) => (
              <li key={s} className={i < stage ? "text-muted-foreground/60 line-through" : i === stage ? "text-foreground" : "text-muted-foreground"}>
                {i < stage ? "✓" : i === stage ? "▸" : "·"} {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reportNeedsRefresh && report && (
        <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
          This cached report was generated with an older structure. It is shown where possible; regenerate to rebuild the full forensic analysis format.
        </div>
      )}

      {!isLoading && !report && !gen.isPending && (
        <div className="mt-4 rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
          <div>No forensic report yet.</div>
          <button
            onClick={() => gen.mutate(false)}
            className="h-8 px-3 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Run forensic analysis
          </button>
        </div>
      )}

      {report && <ReportBody r={report} updatedAt={updatedAt} />}
    </section>
  );
}

function isCurrentReport(raw: unknown): raw is ForensicReport {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<ForensicReport>;
  return !!(
    r.quantitative_sizing &&
    r.causal_chain &&
    r.exposure_map &&
    r.timeline &&
    r.quality
  );
}

function normalizeReport(raw: ForensicReport | Record<string, unknown> | null | undefined): ForensicReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const quantitative = objectAt(r.quantitative_sizing) ?? objectAt(r.quantitativeSizing) ?? {};
  const causal = objectAt(r.causal_chain) ?? objectAt(r.causalChain) ?? {};
  const exposure = objectAt(r.exposure_map) ?? objectAt(r.exposureMap) ?? {};
  const timeline = objectAt(r.timeline) ?? {};
  const quality = objectAt(r.quality) ?? {};

  return {
    executive_summary: textAt(r.executive_summary) || textAt(r.executiveSummary) || textAt(r.summary) || textAt(r.analysis) || "Cached analysis available; regenerate to rebuild the full forensic structure.",
    headline_thesis: textAt(r.headline_thesis) || textAt(r.headlineThesis) || textAt(r.thesis) || textAt(r.title) || "Cached forensic analysis",
    layman_thesis: textAt(r.layman_thesis) || textAt(r.laymanThesis),
    quantitative_sizing: {
      tam_view: textAt(quantitative.tam_view) || textAt(quantitative.tamView) || textAt(quantitative.market_view) || "Not specified in the cached report.",
      revenue_impact_range: textAt(quantitative.revenue_impact_range) || textAt(quantitative.revenueImpactRange) || textAt(quantitative.impact_range) || "Not specified in the cached report.",
      bear_case: textAt(quantitative.bear_case) || textAt(quantitative.bearCase) || "Regenerate to produce a bear-case sizing.",
      base_case: textAt(quantitative.base_case) || textAt(quantitative.baseCase) || "Regenerate to produce a base-case sizing.",
      bull_case: textAt(quantitative.bull_case) || textAt(quantitative.bullCase) || "Regenerate to produce a bull-case sizing.",
      confidence_band: textAt(quantitative.confidence_band) || textAt(quantitative.confidenceBand) || "Not specified in the cached report.",
      key_assumptions: arrayTextAt(quantitative.key_assumptions) || arrayTextAt(quantitative.keyAssumptions),
      bull_triggers: arrayTextAt(quantitative.bull_triggers) || arrayTextAt(quantitative.bullTriggers),
      bear_triggers: arrayTextAt(quantitative.bear_triggers) || arrayTextAt(quantitative.bearTriggers),
    },
    causal_chain: {
      upstream_drivers: arrayTextAt(causal.upstream_drivers) || arrayTextAt(causal.upstreamDrivers),
      trigger_event: textAt(causal.trigger_event) || textAt(causal.triggerEvent) || "Regenerate to map the trigger event.",
      first_order_effects: arrayTextAt(causal.first_order_effects) || arrayTextAt(causal.firstOrderEffects),
      second_order_effects: arrayTextAt(causal.second_order_effects) || arrayTextAt(causal.secondOrderEffects),
      third_order_effects: arrayTextAt(causal.third_order_effects) || arrayTextAt(causal.thirdOrderEffects),
    },
    exposure_map: {
      beneficiaries: exposureRowsAt(exposure.beneficiaries),
      harmed: exposureRowsAt(exposure.harmed),
      neutral_watch: exposureRowsAt(exposure.neutral_watch ?? exposure.neutralWatch).map(({ name, kind, reasoning }) => ({ name, kind, reasoning })),
    },
    historical_precedents: precedentsAt(r.historical_precedents ?? r.historicalPrecedents),
    contrarian_view: textAt(r.contrarian_view) || textAt(r.contrarianView) || "Regenerate to produce a contrarian view.",
    data_gaps: arrayTextAt(r.data_gaps) || arrayTextAt(r.dataGaps),
    catalysts_and_watch_signals: catalystsAt(r.catalysts_and_watch_signals ?? r.catalystsAndWatchSignals),
    timeline: {
      reference_date: textAt(timeline.reference_date) || textAt(timeline.referenceDate),
      data_as_of: textAt(timeline.data_as_of) || textAt(timeline.dataAsOf),
      immediate_0_7d: textAt(timeline.immediate_0_7d) || textAt(timeline.immediate) || "Regenerate to produce 0–7 day timing.",
      near_8_30d: textAt(timeline.near_8_30d) || textAt(timeline.near) || "Regenerate to produce 8–30 day timing.",
      medium_1_3m: textAt(timeline.medium_1_3m) || textAt(timeline.medium) || "Regenerate to produce 1–3 month timing.",
      strategic_3_12m: textAt(timeline.strategic_3_12m) || textAt(timeline.strategic) || "Regenerate to produce 3–12 month timing.",
      inflection_points: arrayTextAt(timeline.inflection_points) || arrayTextAt(timeline.inflectionPoints),
    },
    risk_factors: arrayTextAt(r.risk_factors) || arrayTextAt(r.riskFactors),
    positioning_plays: positioningAt(r.positioning_plays ?? r.positioningPlays),
    final_synopsis: textAt(r.final_synopsis) || textAt(r.finalSynopsis),
    quality: {
      evidence_strength: scoreAt(quality.evidence_strength ?? quality.evidenceStrength),
      source_diversity: scoreAt(quality.source_diversity ?? quality.sourceDiversity),
      contradiction_pressure: scoreAt(quality.contradiction_pressure ?? quality.contradictionPressure),
      overall_confidence: scoreAt(quality.overall_confidence ?? quality.overallConfidence),
    },
  };
}

function objectAt(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textAt(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function arrayTextAt(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => textAt(item) || textAt(objectAt(item)?.text) || textAt(objectAt(item)?.summary)).filter(Boolean);
}

function scoreAt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function exposureRowsAt(value: unknown): Array<{ name: string; kind: string; magnitude: string; reasoning: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { name: item, kind: "watch", magnitude: "moderate", reasoning: "Listed in the cached report." };
    const row = objectAt(item) ?? {};
    return {
      name: textAt(row.name) || textAt(row.entity) || "Unnamed exposure",
      kind: textAt(row.kind) || textAt(row.type) || "entity",
      magnitude: textAt(row.magnitude) || textAt(row.impact) || "moderate",
      reasoning: textAt(row.reasoning) || textAt(row.rationale) || textAt(row.summary) || "Reasoning not specified in the cached report.",
    };
  });
}

function precedentsAt(value: unknown): ForensicReport["historical_precedents"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = objectAt(item) ?? {};
    if (typeof item === "string") return { label: item, period: "n/a", parallel: item, outcome: "Not specified", caveat: "Cached legacy item." };
    return {
      label: textAt(row.label) || textAt(row.title) || "Historical precedent",
      period: textAt(row.period) || textAt(row.date_range) || "n/a",
      parallel: textAt(row.parallel) || textAt(row.similarity) || "Not specified",
      outcome: textAt(row.outcome) || "Not specified",
      caveat: textAt(row.caveat) || "Not specified",
    };
  });
}

function catalystsAt(value: unknown): ForensicReport["catalysts_and_watch_signals"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = objectAt(item) ?? {};
    if (typeof item === "string") return { signal: item, leading_or_lagging: "watch", cadence: "ongoing", source_hint: "Cached report" };
    return {
      signal: textAt(row.signal) || textAt(row.name) || "Watch signal",
      leading_or_lagging: textAt(row.leading_or_lagging) || textAt(row.type) || "watch",
      cadence: textAt(row.cadence) || "ongoing",
      source_hint: textAt(row.source_hint) || textAt(row.source) || "Not specified",
    };
  });
}

function positioningAt(value: unknown): ForensicReport["positioning_plays"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = objectAt(item) ?? {};
    if (typeof item === "string") return { archetype: "Reader", play: item, hedge: "Keep exposure hedged.", monitor: "Monitor the cited watch signals." };
    return {
      archetype: textAt(row.archetype) || textAt(row.user_type) || "Reader",
      play: textAt(row.play) || textAt(row.positioning_angle) || textAt(row.summary) || "Not specified",
      hedge: textAt(row.hedge) || textAt(row.constraints) || "Keep exposure hedged.",
      monitor: textAt(row.monitor) || textAt(row.watch_signal) || "Monitor confirming and disconfirming signals.",
    };
  });
}

function ReportBody({ r, updatedAt }: { r: ForensicReport; updatedAt?: string }) {
  const generatedOn = updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : null;
  const referenceDate = r.timeline?.reference_date ?? generatedOn ?? "";
  const dataAsOf = r.timeline?.data_as_of ?? "";
  const staleRef = referenceDate && generatedOn && referenceDate !== generatedOn;

  return (
    <div className="mt-5 grid gap-4">
      {/* 3.2 Headline thesis + layman explanation */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Headline thesis</div>
        <p className="font-display text-base md:text-lg mt-1">{r.headline_thesis}</p>
        {r.layman_thesis && (
          <div className="mt-3 rounded border border-border/40 bg-background/50 p-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><BookOpen className="h-3 w-3" /> Plain-English explainer</div>
            <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{r.layman_thesis}</p>
          </div>
        )}
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed whitespace-pre-wrap">{r.executive_summary}</p>
        <QualityStrip q={r.quality} />
      </div>

      {/* 3.3 Quantitative sizing + triggers */}
      <Section icon={<Scale className="h-4 w-4" style={{ color: "var(--color-opportunity)" }} />} title="Quantitative sizing">
        <div className="grid md:grid-cols-3 gap-3">
          <Case tag="Bear" tone="risk" text={r.quantitative_sizing.bear_case} />
          <Case tag="Base" tone="reason" text={r.quantitative_sizing.base_case} />
          <Case tag="Bull" tone="opportunity" text={r.quantitative_sizing.bull_case} />
        </div>
        <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
          <KV k="Market view" v={r.quantitative_sizing.tam_view} />
          <KV k="Revenue impact range" v={r.quantitative_sizing.revenue_impact_range} />
          <KV k="Confidence band" v={r.quantitative_sizing.confidence_band} />
        </div>
        {(r.quantitative_sizing.key_assumptions ?? []).length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Key assumptions</div>
            <ul className="mt-1 text-sm list-disc list-outside pl-5 marker:text-muted-foreground space-y-0.5 text-muted-foreground">
              {r.quantitative_sizing.key_assumptions.map((a, i) => <li key={i}><span className="text-foreground">{a}</span></li>)}
            </ul>
          </div>
        )}
        {((r.quantitative_sizing.bull_triggers ?? []).length + (r.quantitative_sizing.bear_triggers ?? []).length) > 0 && (
          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <TriggerList tag="Bull triggers to watch" tone="opportunity" icon={<TrendingUp className="h-3.5 w-3.5" />} items={r.quantitative_sizing.bull_triggers ?? []} />
            <TriggerList tag="Bear triggers to watch" tone="risk" icon={<TrendingDown className="h-3.5 w-3.5" />} items={r.quantitative_sizing.bear_triggers ?? []} />
          </div>
        )}
      </Section>

      {/* 3.4 Timeline (moved up) with freshness banner */}
      <Section
        icon={<Clock className="h-4 w-4" style={{ color: "var(--color-signal)" }} />}
        title="Timeline & inflection points"
        aside={
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex flex-wrap items-center gap-2">
            {referenceDate && <span className="px-1.5 py-0.5 rounded border border-border/60">reference · {referenceDate}</span>}
            {generatedOn && <span className="px-1.5 py-0.5 rounded border border-border/60">generated · {generatedOn}</span>}
            {dataAsOf && <span className="px-1.5 py-0.5 rounded border border-border/60 normal-case tracking-normal">{dataAsOf}</span>}
            {staleRef && <span className="px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--color-risk)", color: "var(--color-risk)" }}>reference date mismatch — regenerate</span>}
          </div>
        }
      >
        <div className="grid md:grid-cols-4 gap-3">
          <KV k="0–7 days" v={r.timeline.immediate_0_7d} />
          <KV k="8–30 days" v={r.timeline.near_8_30d} />
          <KV k="1–3 months" v={r.timeline.medium_1_3m} />
          <KV k="3–12 months" v={r.timeline.strategic_3_12m} />
        </div>
        {(r.timeline.inflection_points ?? []).length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Inflection points to watch</div>
            <ul className="mt-1 text-sm list-disc list-outside pl-5 marker:text-muted-foreground">
              {r.timeline.inflection_points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
      </Section>

      {/* Causal chain */}
      <Section icon={<GitBranch className="h-4 w-4" style={{ color: "var(--color-reason)" }} />} title="Causal chain (three orders deep)">
        <div className="grid md:grid-cols-2 gap-3">
          <ChainList label="Upstream drivers" items={r.causal_chain.upstream_drivers} />
          <div className="rounded border border-border/50 p-3 bg-background/30">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Trigger</div>
            <div className="text-sm mt-1">{r.causal_chain.trigger_event}</div>
          </div>
          <ChainList label="1st-order effects" items={r.causal_chain.first_order_effects} />
          <ChainList label="2nd-order effects" items={r.causal_chain.second_order_effects} />
          <ChainList label="3rd-order effects" items={r.causal_chain.third_order_effects} />
        </div>
      </Section>

      {/* Exposure */}
      <Section icon={<Target className="h-4 w-4" style={{ color: "var(--color-opportunity)" }} />} title="Exposure map — who benefits, who is harmed">
        <div className="grid md:grid-cols-3 gap-3">
          <ExposureCol title="Beneficiaries" icon={<TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--color-growth)" }} />} rows={r.exposure_map.beneficiaries} tone="growth" />
          <ExposureCol title="Harmed" icon={<TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--color-risk)" }} />} rows={r.exposure_map.harmed} tone="risk" />
          <ExposureCol title="Neutral / watch" icon={<Radar className="h-3.5 w-3.5" style={{ color: "var(--color-signal)" }} />} rows={r.exposure_map.neutral_watch.map((n) => ({ ...n, magnitude: "watch" }))} tone="signal" />
        </div>
      </Section>

      {/* Catalysts */}
      <Section icon={<Radar className="h-4 w-4" style={{ color: "var(--color-signal)" }} />} title="Catalysts & watch signals">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground text-left">
              <tr><th className="py-1.5 pr-2">Signal</th><th className="py-1.5 pr-2">Type</th><th className="py-1.5 pr-2">Cadence</th><th className="py-1.5">Where to look</th></tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {r.catalysts_and_watch_signals.map((c, i) => (
                <tr key={i} className="align-top">
                  <td className="py-2 pr-2">{c.signal}</td>
                  <td className="py-2 pr-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.leading_or_lagging}</td>
                  <td className="py-2 pr-2 text-muted-foreground">{c.cadence}</td>
                  <td className="py-2 text-muted-foreground">{c.source_hint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Precedents */}
      <Section icon={<History className="h-4 w-4" style={{ color: "var(--color-reason)" }} />} title="Historical precedents">
        <div className="grid md:grid-cols-2 gap-3">
          {r.historical_precedents.map((p, i) => (
            <div key={i} className="rounded border border-border/50 p-3 bg-background/30">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-sm">{p.label}</div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{p.period}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1"><span className="text-foreground/80">Parallel:</span> {p.parallel}</p>
              <p className="text-xs text-muted-foreground mt-1"><span className="text-foreground/80">Outcome:</span> {p.outcome}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-1 italic"><span className="text-foreground/70">Caveat:</span> {p.caveat}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Contrarian + gaps + risks */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section icon={<ShieldQuestion className="h-4 w-4" style={{ color: "var(--color-risk)" }} />} title="Contrarian view">
          <p className="text-sm whitespace-pre-wrap">{r.contrarian_view}</p>
        </Section>
        <Section icon={<AlertTriangle className="h-4 w-4" style={{ color: "var(--color-risk)" }} />} title="Risk factors & data gaps">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Risk factors</div>
          <ul className="mt-1 text-sm list-disc list-outside pl-5 marker:text-muted-foreground">
            {r.risk_factors.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-3">Data gaps</div>
          <ul className="mt-1 text-sm list-disc list-outside pl-5 marker:text-muted-foreground text-muted-foreground">
            {r.data_gaps.map((x, i) => <li key={i}><span className="text-foreground">{x}</span></li>)}
          </ul>
        </Section>
      </div>

      {/* Positioning */}
      <Section icon={<Target className="h-4 w-4" style={{ color: "var(--color-opportunity)" }} />} title="Hedged positioning plays">
        <div className="grid md:grid-cols-2 gap-3">
          {r.positioning_plays.map((p, i) => (
            <div key={i} className="rounded border border-border/50 p-3 bg-background/30">
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--color-opportunity)" }}>{p.archetype}</div>
              <p className="text-sm mt-1"><span className="text-foreground/80">Play:</span> {p.play}</p>
              <p className="text-xs text-muted-foreground mt-1"><span className="text-foreground/80">Hedge:</span> {p.hedge}</p>
              <p className="text-xs text-muted-foreground mt-1"><span className="text-foreground/80">Monitor:</span> {p.monitor}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Final synopsis */}
      {r.final_synopsis && (
        <Section icon={<BookOpen className="h-4 w-4" style={{ color: "var(--color-signal)" }} />} title="Final synopsis — the reader's takeaway">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.final_synopsis}</p>
        </Section>
      )}

      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground text-center pt-2">
        Public signals only · Not financial advice · No buy · No sell · No target price
      </div>
    </div>
  );
}

function Section({ icon, title, children, aside }: { icon: React.ReactNode; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {icon}
        <h3 className="font-display text-sm tracking-wide">{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-border/50 p-3 bg-background/30">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{k}</div>
      <div className="text-sm mt-1 whitespace-pre-wrap">{v}</div>
    </div>
  );
}
function Case({ tag, tone, text }: { tag: string; tone: "risk" | "opportunity" | "reason"; text: string }) {
  const color = tone === "risk" ? "var(--color-risk)" : tone === "opportunity" ? "var(--color-opportunity)" : "var(--color-reason)";
  return (
    <div className="rounded border p-3 bg-background/30" style={{ borderColor: color }}>
      <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color }}>{tag} case</div>
      <div className="text-sm mt-1 whitespace-pre-wrap">{text}</div>
    </div>
  );
}
function TriggerList({ tag, tone, icon, items }: { tag: string; tone: "risk" | "opportunity"; icon: React.ReactNode; items: string[] }) {
  if (!items.length) return null;
  const color = tone === "risk" ? "var(--color-risk)" : "var(--color-opportunity)";
  return (
    <div className="rounded border p-3 bg-background/30" style={{ borderColor: color }}>
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest" style={{ color }}>{icon}{tag}</div>
      <ul className="mt-1.5 text-sm list-disc list-outside pl-5 marker:text-muted-foreground space-y-1">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}
function ChainList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded border border-border/50 p-3 bg-background/30">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <ul className="mt-1 text-sm list-disc list-outside pl-5 marker:text-muted-foreground space-y-0.5">
        {items.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
    </div>
  );
}
function ExposureCol({ title, icon, rows, tone }: { title: string; icon: React.ReactNode; rows: Array<{ name: string; kind: string; magnitude: string; reasoning: string }>; tone: "growth" | "risk" | "signal" }) {
  const color = tone === "growth" ? "var(--color-growth)" : tone === "risk" ? "var(--color-risk)" : "var(--color-signal)";
  return (
    <div className="rounded border border-border/50 p-3 bg-background/30">
      <div className="flex items-center gap-1.5 mb-2">{icon}<div className="text-[10px] font-mono uppercase tracking-widest" style={{ color }}>{title}</div></div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="border-b border-border/30 pb-2 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{r.name}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{r.kind} · {r.magnitude}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{r.reasoning}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const QUALITY_TOOLTIPS: Record<string, string> = {
  Evidence: "Evidence strength (0–1): weight of atomic claims supporting this thesis, adjusted for source reliability and specificity. Higher = more, better-attested claims.",
  Diversity: "Source diversity (0–1): breadth of independent outlets and origins behind the evidence. Higher = fewer copy-loops, more perspectives.",
  Contradiction: "Contradiction pressure (0–1): how much conflicting evidence exists. Higher = more disagreement between sources; treat conclusions with care.",
  Confidence: "Overall confidence (0–1): the model's calibrated confidence in this synthesis. Blends evidence strength, diversity, contradictions and internal consistency.",
};

function QualityStrip({ q }: { q: ForensicReport["quality"] }) {
  const items = [
    { k: "Evidence", v: q.evidence_strength, c: "var(--color-signal)" },
    { k: "Diversity", v: q.source_diversity, c: "var(--color-reason)" },
    { k: "Contradiction", v: q.contradiction_pressure, c: "var(--color-risk)" },
    { k: "Confidence", v: q.overall_confidence, c: "var(--color-opportunity)" },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((i) => (
        <div key={i.k} className="rounded border border-border/50 p-2 bg-background/30" title={QUALITY_TOOLTIPS[i.k]}>
          <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {i.k}
            <Info className="h-3 w-3 opacity-60" />
          </div>
          <div className="font-display text-lg leading-none mt-0.5" style={{ color: i.c }}>{Number(i.v).toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
