import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import {
  autoAnalyseTopConvergence,
  listNarrativeDivergence,
  type Framing,
  type NarrativeDivergenceRow,
} from "@/lib/archlight/divergence.functions";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/narrative-divergence")({
  head: () => ({
    meta: [
      { title: "Archlight · Narrative divergence" },
      { name: "description", content: "How independent outlets across the political spectrum frame the same story — baseline, per-outlet angle, and a divergence gauge. Framing analysis, not truth claims." },
      { property: "og:title", content: "Archlight · Narrative divergence" },
      { property: "og:description", content: "Compare how outlets across the spectrum frame the same story." },
    ],
  }),
  component: NarrativeDivergencePage,
});

function NarrativeDivergencePage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["narrative-divergence", "list"],
    queryFn: () => listNarrativeDivergence({ data: { limit: 20 } }),
  });
  const analyse = useMutation({
    mutationFn: () => autoAnalyseTopConvergence({ data: { limit: 5 } }),
    onSuccess: (r) => {
      toast.success(`Analysed ${r.analysed} · skipped ${r.skipped}`);
      qc.invalidateQueries({ queryKey: ["narrative-divergence"] });
    },
    onError: (e) => toast.error("Analysis failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const rows = q.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const featured: NarrativeDivergenceRow | null = useMemo(() => {
    if (rows.length === 0) return null;
    if (selectedId) {
      const found = rows.find((r) => r.event_candidate_id === selectedId);
      if (found) return found;
    }
    return rows[0];
  }, [rows, selectedId]);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Explore · Narrative divergence</div>
            <h1 className="font-display text-2xl md:text-3xl mt-1">
              {featured?.title ?? "Where the story splits"}
            </h1>
            {featured && (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
                {featured.n_outlets ?? 0} outlets · {featured.n_with_lean ?? 0} independent voices · updated{" "}
                <span suppressHydrationWarning>
                  {featured.computed_at ? new Date(featured.computed_at).toLocaleString() : "—"}
                </span>
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Framing analysis of public coverage — describes how outlets tell the story, not which is true. Lean per AllSides.
            </p>
          </div>
          <button
            onClick={() => analyse.mutate()}
            disabled={analyse.isPending}
            className="h-9 px-4 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
          >
            {analyse.isPending ? (
              <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Analysing…</span>
            ) : "Analyse latest"}
          </button>
        </div>

        {q.isLoading && (
          <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">Loading…</div>
        )}

        {!q.isLoading && rows.length === 0 && (
          <div className="glass-panel rounded-xl p-10 text-center max-w-xl mx-auto flex flex-col gap-3 items-center">
            <Sparkles className="h-5 w-5 text-muted-foreground"/>
            <div className="font-display text-lg">No narrative divergence yet</div>
            <p className="text-sm text-muted-foreground">
              It appears when several independent outlets across the spectrum cover the same story. Run a scan, then Analyse latest.
            </p>
            <button
              onClick={() => analyse.mutate()}
              disabled={analyse.isPending}
              className="mt-2 h-9 px-4 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
            >
              {analyse.isPending ? "Analysing…" : "Analyse latest"}
            </button>
          </div>
        )}

        {featured && <FeaturedView row={featured} />}

        {rows.length > 1 && (
          <section className="glass-panel rounded-xl p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Other stories</div>
            <ul className="space-y-1.5">
              {rows.filter((r) => r.event_candidate_id !== featured?.event_candidate_id).map((r) => (
                <li key={r.event_candidate_id}>
                  <button
                    onClick={() => setSelectedId(r.event_candidate_id)}
                    className="w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-accent/40 transition"
                  >
                    <span className="flex-1 text-sm truncate">{r.title ?? "Untitled event"}</span>
                    <MiniBar score={r.divergence_score}/>
                    <span className="w-10 text-right text-[11px] font-mono text-muted-foreground">
                      {r.divergence_score ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-4">
          Framing analysis · describes coverage, not truth · public signals only
        </footer>
      </div>
    </AppShell>
  );
}

function labelColor(label: string | null): string {
  if (label === "Sharply divergent") return "var(--color-risk)";
  if (label === "Mixed") return "#E0A23A";
  if (label === "Aligned") return "var(--color-opportunity)";
  return "var(--color-muted-foreground)";
}

function FeaturedView({ row }: { row: NarrativeDivergenceRow }) {
  const score = row.divergence_score;
  const label = row.divergence_label;
  const framings = row.outlet_framings ?? [];

  const takeLine = (() => {
    if (score === null) return "Awaiting divergence score.";
    if (score >= 67) return "Outlets tell sharply different stories on cause, blame or consequence.";
    if (score >= 34) return "They largely agree on the facts but split on cause and consequence.";
    return "Coverage is broadly aligned across the spectrum.";
  })();

  return (
    <>
      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 md:col-span-5 glass-panel rounded-xl p-5 flex flex-col items-center">
          <Gauge score={score}/>
          <div className="mt-2 font-display text-3xl" style={{ color: labelColor(label) }}>
            {score !== null ? `${score}%` : "—"}
          </div>
          <div className="text-sm font-mono uppercase tracking-widest" style={{ color: labelColor(label) }}>
            {label ?? "unrated"}
          </div>
          <div className="mt-2 w-full flex justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>Aligned</span>
            <span>Contradictory</span>
          </div>
        </section>

        <section className="col-span-12 md:col-span-7 glass-panel rounded-xl p-5 flex flex-col gap-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Summary</div>
          <div className="font-display text-lg">
            {row.distinct_lean_zones ?? 0} lean zones · {row.n_outlets ?? 0} outlets
          </div>
          <p className="text-sm text-muted-foreground">{takeLine}</p>
          {(row.affected_sector || row.affected_region || row.event_class) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {row.event_class && <Chip>{row.event_class}</Chip>}
              {row.affected_sector && <Chip>{row.affected_sector}</Chip>}
              {row.affected_region && <Chip>{row.affected_region}</Chip>}
            </div>
          )}
        </section>
      </div>

      <section className="glass-panel rounded-xl p-5 border-l-4" style={{ borderLeftColor: "var(--color-signal)" }}>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">What actually happened</div>
        <p className="text-sm leading-relaxed">{row.baseline || <span className="italic text-muted-foreground">Baseline unavailable.</span>}</p>
      </section>

      <LeanSpectrum framings={framings} />

      {framings.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {framings.map((f, i) => <FramingCard key={`${f.domain}-${i}`} f={f}/>)}
        </section>
      )}
    </>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-md border border-border/60 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function Gauge({ score }: { score: number | null }) {
  const s = score === null ? 0 : Math.max(0, Math.min(100, score));
  const theta = 180 - (s / 100) * 180; // degrees
  const rad = (theta * Math.PI) / 180;
  const x = 110 + 70 * Math.cos(rad);
  const y = 112 - 70 * Math.sin(rad);

  // Semicircle arcs. r=88 centred at (110,112). Semicircle spans x=22..198.
  // Split into three equal thirds by parametric angle.
  const arcPath = (a1: number, a2: number) => {
    const p1x = 110 + 88 * Math.cos((a1 * Math.PI) / 180);
    const p1y = 112 - 88 * Math.sin((a1 * Math.PI) / 180);
    const p2x = 110 + 88 * Math.cos((a2 * Math.PI) / 180);
    const p2y = 112 - 88 * Math.sin((a2 * Math.PI) / 180);
    return `M ${p1x} ${p1y} A 88 88 0 0 1 ${p2x} ${p2y}`;
  };

  return (
    <svg viewBox="0 0 220 130" className="w-full max-w-xs" aria-label={`Divergence gauge ${s}`}>
      {/* Right third (red) — angle 0..60 */}
      <path d={arcPath(60, 0)} stroke="var(--color-risk)" strokeWidth="15" fill="none" strokeLinecap="round"/>
      {/* Middle third (amber) — angle 60..120 */}
      <path d={arcPath(120, 60)} stroke="#E0A23A" strokeWidth="15" fill="none" strokeLinecap="round"/>
      {/* Left third (green) — angle 120..180 */}
      <path d={arcPath(180, 120)} stroke="var(--color-opportunity)" strokeWidth="15" fill="none" strokeLinecap="round"/>
      {/* Needle */}
      <line x1="110" y1="112" x2={x} y2={y} stroke="var(--color-foreground)" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="110" cy="112" r="6" fill="var(--color-foreground)"/>
    </svg>
  );
}

function MiniBar({ score }: { score: number | null }) {
  const s = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color = s >= 67 ? "var(--color-risk)" : s >= 34 ? "#E0A23A" : "var(--color-opportunity)";
  return (
    <div className="hidden sm:block w-24 h-1.5 rounded-full bg-border/60 overflow-hidden">
      <div style={{ width: `${s}%`, background: color }} className="h-full"/>
    </div>
  );
}

function LeanSpectrum({ framings }: { framings: Framing[] }) {
  const zones = { left: [] as Framing[], centre: [] as Framing[], right: [] as Framing[] };
  for (const f of framings) {
    const lean = (f.lean ?? "").toLowerCase();
    if (lean === "left" || lean === "lean_left") zones.left.push(f);
    else if (lean === "right" || lean === "lean_right") zones.right.push(f);
    else if (lean === "center" || lean === "centre" || lean === "mixed") zones.centre.push(f);
    else zones.centre.push(f);
  }
  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Lean spectrum</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Zone title="Left" outlets={zones.left}/>
        <Zone title="Centre" outlets={zones.centre}/>
        <Zone title="Right" outlets={zones.right}/>
      </div>
    </section>
  );
}

function Zone({ title, outlets }: { title: string; outlets: Framing[] }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {outlets.length === 0 && <span className="text-xs italic text-muted-foreground">—</span>}
        {outlets.map((o, i) => (
          <span key={`${o.domain}-${i}`} className="inline-flex items-center h-6 px-2 rounded-md bg-accent/40 border border-border/60 text-[11px]">
            {o.outlet_name ?? o.domain}
          </span>
        ))}
      </div>
    </div>
  );
}

function FramingCard({ f }: { f: Framing }) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="font-display text-sm">{f.outlet_name ?? f.domain}</div>
        {f.lean_label && (
          <span className="inline-flex items-center h-5 px-1.5 rounded text-[10px] font-mono uppercase tracking-widest border border-border/60 text-muted-foreground">
            {f.lean_label}
          </span>
        )}
      </div>
      {f.angle && (
        <div className="font-display text-sm" style={{ color: "var(--color-signal)" }}>{f.angle}</div>
      )}
      {f.emphasises && (
        <div className="text-xs"><span className="text-muted-foreground">Emphasises:</span> {f.emphasises}</div>
      )}
      {f.downplays && (
        <div className="text-xs"><span className="text-muted-foreground">Downplays:</span> {f.downplays}</div>
      )}
      {f.framing && (
        <div className="text-xs italic text-muted-foreground">Framed as: {f.framing}</div>
      )}
    </div>
  );
}
