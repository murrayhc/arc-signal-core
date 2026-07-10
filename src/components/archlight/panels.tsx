import { ArrowDownRight, ArrowUpRight, Radio, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data);
  const w = 90, h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[90px] h-7">
      <polyline points={pts} fill="none" stroke="var(--color-opportunity)" strokeWidth="1.5"/>
    </svg>
  );
}

export interface OpportunityItem {
  id: string;
  title: string;
  opportunity_type: string;
  summary: string | null;
  affected_sectors: string[] | null;
  affected_regions: string[] | null;
  urgency_score: number;
  commercial_value_score: number;
  confidence: number;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function titlesRelated(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizeTitle(a), nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.includes(na)) return true;
  if (nb.length >= 6 && na.includes(nb)) return true;
  // token overlap: 2+ shared tokens of length >= 4
  const ta = new Set(na.split(" ").filter((t) => t.length >= 4));
  const tb = nb.split(" ").filter((t) => t.length >= 4);
  let hits = 0;
  for (const t of tb) if (ta.has(t)) hits++;
  return hits >= 2;
}

export function ActiveOpportunities({ items, highlightTitle }: { items: OpportunityItem[]; highlightTitle?: string | null }) {
  return (
    <PanelShell title="Active Opportunities" icon={<Sparkles className="h-4 w-4" style={{ color: "var(--color-opportunity)" }}/>} count={items.length}>
      {items.length === 0 && <Empty label="No opportunity cards yet. Run scan to populate."/>}
      <ul className="divide-y divide-border/50">
        {items.map(op => {
          const score = Math.round(Number(op.commercial_value_score) * 100);
          const tag = score >= 70 ? "High Potential" : score >= 50 ? "Moderate" : "Watch";
          const sector = [(op.affected_sectors ?? []).join(", "), (op.affected_regions ?? []).join(", ")].filter(Boolean).join(" · ");
          const hit = titlesRelated(highlightTitle, op.title);
          return (
            <li key={op.id} className={`py-3 group transition ${hit ? "ring-1 ring-[color:var(--color-opportunity)] rounded-md bg-[color:var(--color-opportunity)]/5 -mx-1 px-1" : highlightTitle ? "opacity-40" : ""}`}>
              <Link to="/opportunities/$id" params={{ id: op.id }} className="flex items-start gap-3 hover:bg-background/40 rounded-md -mx-1 px-1 py-0.5 transition">
                <div className="flex flex-col items-center pt-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">score</span>
                  <span className="font-display text-lg leading-none" style={{ color: "var(--color-opportunity)" }}>{score}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-foreground truncate group-hover:text-[color:var(--color-opportunity)]">{op.title}</div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--color-opportunity)", color: "var(--color-opportunity)" }}>{tag}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{sector || op.opportunity_type}</span>·<span>conf {Number(op.confidence).toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-mono text-muted-foreground truncate">{op.summary ?? "—"}</div>
                    <Sparkline data={syntheticSpark(Number(op.commercial_value_score))}/>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

function syntheticSpark(v: number): number[] {
  const base = Math.max(2, v * 10);
  return Array.from({ length: 10 }, (_, i) => Math.round(base + Math.sin(i / 1.7) * 2 + i * 0.35));
}

export interface RiskItem {
  id: string;
  title: string;
  summary: string | null;
  severity: string;
  risk_score: number;
  probability: number;
  confidence: number;
  affected_sector: string | null;
  affected_region: string | null;
  last_updated_at: string;
}

export function TopRisks({ items, highlightTitle }: { items: RiskItem[]; highlightTitle?: string | null }) {
  return (
    <PanelShell title="Top Risks" icon={<ShieldAlert className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>} count={items.length}>
      {items.length === 0 && <Empty label="No risks surfaced. Run scan to populate."/>}
      <ul className="divide-y divide-border/50">
        {items.map(r => {
          const score = Math.round(Number(r.risk_score) * 100);
          const hit = titlesRelated(highlightTitle, r.title);
          return (
            <li key={r.id} className={`py-3 transition ${hit ? "ring-1 ring-[color:var(--color-risk)] rounded-md bg-[color:var(--color-risk)]/5 -mx-1 px-1" : highlightTitle ? "opacity-40" : ""}`}>
              <Link to="/events/$id" params={{ id: r.id }} className="block hover:bg-background/40 rounded-md -mx-1 px-1 py-0.5 transition group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground group-hover:text-[color:var(--color-risk)]">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.summary}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-xl leading-none" style={{ color: score > 70 ? "var(--color-risk-strong)" : "var(--color-risk)" }}>{score}</div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">risk</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span><span className="text-foreground/80">{r.severity}</span> severity</span>
                  <span>prob: <span className="text-foreground/80">{Math.round(Number(r.probability) * 100)}%</span></span>
                  <span>{[r.affected_sector, r.affected_region].filter(Boolean).join(" · ")}</span>
                  <span className="ml-auto" suppressHydrationWarning>{timeAgo(r.last_updated_at)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function LiveScanningBars() {
  const bars = [
    { label: "Markets", value: 92 },
    { label: "Companies", value: 78 },
    { label: "News & media", value: 85 },
    { label: "Social signals", value: 61 },
    { label: "Supply chain", value: 54 },
    { label: "Regulatory", value: 88 },
    { label: "Procurement", value: 72 },
    { label: "Commodities", value: 80 },
  ];
  return (
    <PanelShell title="Live Scanning" icon={<Radio className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>}>
      <ul className="space-y-2.5">
        {bars.map(s => (
          <li key={s.label}>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground uppercase tracking-widest">{s.label}</span>
              <span>{s.value}%</span>
            </div>
            <div className="relative h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.value}%`, background: "linear-gradient(90deg, var(--color-signal), var(--color-signal-glow))" }}/>
              <div className="absolute inset-y-0 w-8 opacity-70" style={{ background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.35), transparent)", animation: "scan-sweep 3.2s linear infinite" }}/>
            </div>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

export function TrendSignals() {
  const trends = [
    { label: "Clean energy investment", delta: +14, dir: "up" as const },
    { label: "AI automation", delta: +22, dir: "up" as const },
    { label: "Cybersecurity", delta: +9, dir: "up" as const },
    { label: "Public procurement", delta: +7, dir: "up" as const },
    { label: "Talent movement", delta: +4, dir: "up" as const },
    { label: "Inflation pressure", delta: -3, dir: "down" as const },
    { label: "Commodity prices", delta: -5, dir: "down" as const },
    { label: "Regulatory pressure", delta: +11, dir: "up" as const },
  ];
  return (
    <PanelShell title="Trend Signals" icon={<TrendingUp className="h-4 w-4" style={{ color: "var(--color-growth)" }}/>}>
      <ul className="grid grid-cols-1 gap-1.5">
        {trends.map(t => (
          <li key={t.label} className="flex items-center justify-between px-2 py-1.5 rounded border border-border/40 bg-background/30">
            <span className="text-xs">{t.label}</span>
            <span className="flex items-center gap-1 font-mono text-[11px]" style={{ color: t.dir === "up" ? "var(--color-growth)" : "var(--color-risk)" }}>
              {t.dir === "up" ? <ArrowUpRight className="h-3 w-3"/> : <ArrowDownRight className="h-3 w-3"/>}
              {t.delta > 0 ? `+${t.delta}` : t.delta}%
            </span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

export interface SystemStats {
  source_coverage: number;
  model_health: number;
  evidence_quality: number;
  copy_loop_hygiene: number;
}

export function SystemConfidence({ system, lastScan }: { system: SystemStats; lastScan: { status: string; finished_at: string | null; sources_succeeded: number; sources_attempted: number; documents_collected: number; atomic_claims_created: number; notes: string | null } | null }) {
  const metrics = [
    { label: "Model health", val: system.model_health, color: "var(--color-signal)" },
    { label: "Source coverage", val: system.source_coverage, color: "var(--color-growth)" },
    { label: "Evidence quality", val: system.evidence_quality, color: "var(--color-opportunity)" },
    { label: "Copy-loop hygiene", val: system.copy_loop_hygiene, color: "var(--color-reason)" },
  ];
  return (
    <PanelShell title="System Confidence" icon={<span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--color-signal)" }}/>}>
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="relative rounded-md border border-border/50 p-3 bg-background/30">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{m.label}</div>
            <div className="mt-1 flex items-end gap-1">
              <span className="font-display text-2xl leading-none" style={{ color: m.color }}>{Number(m.val).toFixed(2)}</span>
              <span className="text-[10px] font-mono text-muted-foreground pb-0.5">/ 1.00</span>
            </div>
            <div className="h-1 mt-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Number(m.val) * 100}%`, background: m.color }}/>
            </div>
          </div>
        ))}
      </div>
      {lastScan && (
        <div className="mt-3 text-[11px] text-muted-foreground font-mono">
          Last scan · <span className="text-foreground">{lastScan.status}</span> ·{" "}
          {lastScan.sources_succeeded}/{lastScan.sources_attempted} sources · {lastScan.documents_collected} docs · {lastScan.atomic_claims_created} claims
          {lastScan.notes ? <span className="block mt-1 opacity-70 truncate">note: {lastScan.notes}</span> : null}
        </div>
      )}
    </PanelShell>
  );
}

export function InternationalData() {
  const regions = [
    { r: "North America", v: 0.71, d: "+0.04" },
    { r: "Europe", v: 0.83, d: "+0.11" },
    { r: "APAC", v: 0.62, d: "-0.02" },
    { r: "LatAm", v: 0.55, d: "+0.07" },
    { r: "MENA", v: 0.48, d: "+0.01" },
  ];
  return (
    <PanelShell title="International Data" subtitle="Macro pulse by region">
      <ul className="space-y-2">
        {regions.map(x => (
          <li key={x.r} className="flex items-center gap-3">
            <div className="w-24 text-xs text-muted-foreground">{x.r}</div>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${x.v * 100}%`, background: "linear-gradient(90deg, var(--color-reason), var(--color-signal))" }}/>
            </div>
            <div className="w-14 text-right font-mono text-[11px]" style={{ color: x.d.startsWith("-") ? "var(--color-risk)" : "var(--color-growth)" }}>{x.d}</div>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

export function LocalMarketFocus({ counts }: { counts: { events_tracked: number; open_opportunities: number; active_risks: number; sources_online: number; sources_total: number } }) {
  return (
    <PanelShell title="Local Focus" subtitle="EU · EV manufacturing">
      <div className="text-xs text-muted-foreground">Selected lens applied. Live market provider not configured.</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "Events", v: counts.events_tracked },
          { k: "Opportunities", v: counts.open_opportunities },
          { k: "Risks", v: counts.active_risks },
          { k: "Sources", v: `${counts.sources_online}/${counts.sources_total}` },
          { k: "Contradictions", v: 3 },
          { k: "Data gaps", v: 5 },
        ].map(x => (
          <div key={x.k} className="rounded-md border border-border/40 p-2 bg-background/30">
            <div className="font-display text-xl leading-none">{x.v}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{x.k}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span className="inline-block px-2 py-0.5 rounded border border-border/60">demo intelligence data · run scan to add live events</span>
      </div>
    </PanelShell>
  );
}

export function GlobalPulseTicker({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <div className="flex items-stretch">
        <div className="px-3 py-2 border-r border-border/60 flex items-center gap-2 shrink-0">
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--color-signal)" }}/>
          <span className="text-[10px] font-mono uppercase tracking-widest">Global pulse</span>
        </div>
        <div className="relative overflow-hidden flex-1">
          <div className="flex gap-8 whitespace-nowrap py-2 will-change-transform" style={{ animation: "ticker-scroll 60s linear infinite" }}>
            {doubled.map((x, i) => (
              <span key={i} className="text-[11px] font-mono text-muted-foreground">
                <span className="mr-2" style={{ color: "var(--color-signal)" }}>◆</span>{x}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelShell({ title, subtitle, icon, count, children }: { title: string; subtitle?: string; icon?: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section className="glass-panel rounded-xl p-4 flex flex-col h-full">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-display text-sm tracking-wide">{title}</h3>
          {subtitle && <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {subtitle}</span>}
        </div>
        {count !== undefined && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">{count}</span>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll pr-1">{children}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-xs text-muted-foreground italic py-6 text-center">{label}</div>;
}
