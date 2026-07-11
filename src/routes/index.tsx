import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, InterrogateSearch } from "@/components/archlight/AppShell";
import { IntelligenceBrain, type GNode } from "@/components/archlight/IntelligenceBrain";
import {
  ActiveOpportunities, TopRisks, LiveScanningBars, TrendSignals,
  SystemConfidence, InternationalData, LocalMarketFocus, GlobalPulseTicker,
} from "@/components/archlight/panels";
import { dashboardQueryOptions } from "@/lib/archlight/queries";
import { runScan } from "@/lib/archlight/pipeline.functions";
import { getScanSettings } from "@/lib/archlight/settings.functions";
import { countKnobsOffDefault } from "@/lib/archlight/settings.defaults";
import { listExposureHits, markHitSeen } from "@/lib/archlight/exposure.functions";
import { getRisingStressRail } from "@/lib/archlight/beliefs.functions";
import { toast } from "sonner";
import { Activity, ArrowDown, ArrowUp, Crosshair, Minus, Settings } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Archlight · Live Intelligence Dashboard" },
      { name: "description", content: "Archlight watches public information, maps consequence, and surfaces strategic openings before they become obvious." },
      { property: "og:title", content: "Archlight · Live Intelligence Dashboard" },
      { property: "og:description", content: "Archlight watches public information, maps consequence, and surfaces strategic openings before they become obvious." },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(dashboardQueryOptions);
  },
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  const router = useRouter();
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);

  const scan = useMutation({
    mutationFn: () => runScan(),
    onSuccess: (r) => {
      toast.success(`Scan ${r.status}`, {
        description: `${r.sources_succeeded}/${r.sources_attempted} sources · ${r.documents_collected} docs · ${r.atomic_claims_created} atomic claims`,
      });
      router.invalidate();
    },
    onError: (e) => toast.error("Scan failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <AppShell onRunScan={() => scan.mutate()} scanning={scan.isPending}>
      {/* Page header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Command centre</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">
            Archlight Live Intelligence Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Watching public information, tracing claims to origin, and mapping who may benefit or be harmed — in real time.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          <ScanTuningPill />
          <span className="px-2 py-1 rounded border border-border/60">Not presented as financial advice or guidance — information purposes only</span>
        </div>
      </div>


      {/* Featured search */}
      <InterrogateSearch />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi k="Sources online" v={`${data.counts.sources_online}/${data.counts.sources_total}`} accent="var(--color-signal)"/>
        <Kpi k="Events tracked" v={String(data.counts.events_tracked)} />
        <Kpi k="Open opportunities" v={String(data.counts.open_opportunities)} accent="var(--color-opportunity)"/>
        <Kpi k="Active risks" v={String(data.counts.active_risks)} accent="var(--color-risk)"/>
        <Kpi k="Model confidence" v={data.system.model_health.toFixed(2)} accent="var(--color-reason)"/>
      </div>

      {/* Hero brain + side lists */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-3 order-2 xl:order-1 xl:h-[560px]">
          <ActiveOpportunities items={data.opportunities} highlightTitle={selectedNode?.title ?? null}/>
        </div>
        <div className="col-span-12 xl:col-span-6 order-1 xl:order-2">
          <IntelligenceBrain
            nodes={data.graph.nodes}
            edges={data.graph.edges}
            confidence={data.system.model_health}
            selectedNodeId={selectedNode?.id ?? null}
            onSelectNode={setSelectedNode}
          />
        </div>
        <div className="col-span-12 xl:col-span-3 order-3 xl:h-[560px]">
          <TopRisks items={data.risks} highlightTitle={selectedNode?.title ?? null}/>
        </div>
      </div>


      <YourExposuresRail />

      {/* Lower grid */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 md:col-span-6 xl:col-span-3"><InternationalData/></div>
        <div className="col-span-12 md:col-span-6 xl:col-span-3"><LocalMarketFocus counts={data.counts}/></div>
        <div className="col-span-12 md:col-span-6 xl:col-span-3"><LiveScanningBars/></div>
        <div className="col-span-12 md:col-span-6 xl:col-span-3"><TrendSignals/></div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-6"><SystemConfidence system={data.system} lastScan={data.system.last_scan}/></div>
        <div className="col-span-12 xl:col-span-6">
          <section className="glass-panel rounded-xl p-4 h-full">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm tracking-wide">Strategic Positioning Examples</h3>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">not financial advice</span>
            </div>
            <ul className="mt-3 grid md:grid-cols-2 gap-3">
              {data.positioning.map((x) => (
                <li key={x.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-sm">{x.title}</div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60" style={{ color: "var(--color-reason)" }}>conf {Number(x.confidence).toFixed(2)}</span>
                  </div>
                  <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{x.user_type}</div>
                  <p className="text-xs text-muted-foreground mt-2">{x.how_it_could_be_used}</p>
                  <p className="text-[11px] text-muted-foreground/80 mt-1"><span className="text-foreground/80">Why it may matter:</span> {x.why_it_may_matter}</p>
                  {x.constraints && <p className="text-[11px] text-muted-foreground/70 mt-1"><span className="text-foreground/80">Constraints:</span> {x.constraints}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* Ticker */}
      <GlobalPulseTicker items={buildTicker(data)}/>

      <footer className="pt-2 pb-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>Archlight · Live Intelligence Engine</span>
        <span>Public signals only · No buy · No sell · No target price</span>
      </footer>
    </AppShell>
  );
}

function Kpi({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="glass-panel rounded-lg px-3 py-2.5">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{k}</div>
      <div className="font-display text-2xl leading-tight mt-0.5" style={accent ? { color: accent } : undefined}>{v}</div>
    </div>
  );
}

function ScanTuningPill() {
  const { data } = useQuery({ queryKey: ["scan-settings"], queryFn: () => getScanSettings(), staleTime: 60_000 });
  if (!data) return null;
  const n = countKnobsOffDefault(data);
  return (
    <Link
      to="/settings/scan"
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border transition ${n === 0 ? "border-border/60 text-muted-foreground hover:text-foreground" : "border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10"}`}
    >
      <Settings className="h-3 w-3" />
      {n === 0 ? "Scan · baseline" : `Scan tuned · ${n} off default`}
    </Link>
  );
}

function directionBadge(dir: string) {
  const color = dir === "risk" ? "var(--color-risk)" : dir === "opportunity" ? "var(--color-opportunity)" : "var(--color-reason)";
  return (
    <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border" style={{ borderColor: `color-mix(in oklch, ${color} 60%, transparent)`, color }}>
      {dir}
    </span>
  );
}

function YourExposuresRail() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["exposures", "top-unseen"],
    queryFn: () => listExposureHits({ data: { unseenOnly: true, activeOnly: true, limit: 8 } }),
    staleTime: 20_000,
  });
  const seen = useMutation({
    mutationFn: (id: string) => markHitSeen({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exposures"] }),
  });

  const hits = data?.hits ?? [];
  const eventMap = new Map((data?.events ?? []).map((e) => [e.id, e] as const));
  const itemMap = new Map((data?.items ?? []).map((i) => [i.id, i] as const));

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
        <h3 className="font-display text-sm tracking-wide">Your exposures</h3>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          why this matters to you
        </span>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}

      {!isLoading && hits.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">
            No exposure profiles yet — tell Archlight what you hold and it will watch it for you.
          </p>
          <Link
            to="/exposures"
            className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10"
          >
            <Crosshair className="h-3.5 w-3.5"/> Set up exposures
          </Link>
        </div>
      )}

      {hits.length > 0 && (
        <ul className="grid md:grid-cols-2 gap-2">
          {hits.map((h) => {
            const ev = eventMap.get(h.event_candidate_id);
            const it = itemMap.get(h.exposure_item_id);
            if (!ev || !it) return null;
            return (
              <li key={h.id} className="rounded-lg border border-border/50 bg-background/30 p-3 hover:border-[color:var(--color-signal)]/40 transition">
                <Link
                  to="/events/$id"
                  params={{ id: ev.id }}
                  onClick={() => seen.mutate(h.id)}
                  className="block"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{it.kind}</span>
                    <span className="font-display text-sm">{it.name}</span>
                    <span className="ml-auto text-[10px] font-mono text-[color:var(--color-signal)]">
                      {(Number(h.relevance) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-foreground/90 mt-1 line-clamp-2">{ev.title}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {directionBadge(h.direction ?? "mixed")}
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      via · {h.match_kind}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}




function buildTicker(data: { system: { source_coverage: number; model_health: number }; counts: { sources_online: number; sources_total: number }; opportunities: Array<{ title: string }>; risks: Array<{ title: string }> }): string[] {
  return [
    `Global pulse · model ${data.system.model_health.toFixed(2)}`,
    `Source coverage ${(data.system.source_coverage * 100).toFixed(0)}%`,
    "Market provider not configured",
    "Commodity provider not configured",
    ...data.opportunities.slice(0, 3).map((o) => `Signal ↑ ${o.title}`),
    ...data.risks.slice(0, 3).map((r) => `Risk ⚠ ${r.title}`),
    `Sources online ${data.counts.sources_online} / ${data.counts.sources_total}`,
    "No financial advice · Public signals only",
  ];
}
