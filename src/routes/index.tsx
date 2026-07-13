import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell, InterrogateSearch } from "@/components/archlight/AppShell";
import { ActiveOpportunities } from "@/components/archlight/panels";
import { dashboardQueryOptions } from "@/lib/archlight/queries";
import { runScan } from "@/lib/archlight/pipeline.functions";
import { getScanSettings } from "@/lib/archlight/settings.functions";
import { countKnobsOffDefault } from "@/lib/archlight/settings.defaults";
import { listExposureHits, markHitSeen } from "@/lib/archlight/exposure.functions";
import { getRisingStressRail } from "@/lib/archlight/beliefs.functions";
import { toast } from "sonner";
import { Activity, ArrowDown, ArrowUp, Bell, Crosshair, Minus, Receipt, Settings, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Archlight · Your book" },
      { name: "description", content: "Archlight watches public information, maps consequence, and surfaces strategic openings before they become obvious." },
      { property: "og:title", content: "Archlight · Your book" },
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
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Your book</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">
            What's moving on your book
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The signals that matter to the things you hold, watch, and care about.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          <ScanTuningPill />
          <span className="px-2 py-1 rounded border border-border/60">Not presented as financial advice or guidance — information purposes only</span>
        </div>
      </div>

      {/* Featured search */}
      <InterrogateSearch />

      {/* What moved on your book */}
      <section>
        <SectionLabel>What moved on your book</SectionLabel>
        <YourExposuresRail />
      </section>

      {/* Do next */}
      <section>
        <SectionLabel>Do next</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DoNextCard
            icon={<Bell className="h-4 w-4" style={{ color: "var(--color-signal)" }} />}
            title="Never miss the morning read"
            line="Get briefings delivered where you already are."
            to="/settings/delivery"
            action="Set up delivery →"
          />
          <DoNextCard
            icon={<Receipt className="h-4 w-4" style={{ color: "var(--color-signal)" }} />}
            title="Check the receipts"
            line="See how calibrated Archlight's calls have been."
            to="/track-record"
            action="Open track record →"
          />
          <DoNextCard
            icon={<SlidersHorizontal className="h-4 w-4" style={{ color: "var(--color-signal)" }} />}
            title="Tune what you watch"
            line="Add holdings, sectors, and entities to your book."
            to="/exposures"
            action="Edit your book →"
          />
        </div>
      </section>

      {/* Deeper on your entities */}
      <section>
        <SectionLabel>Deeper on your entities</SectionLabel>
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-6">
            <RisingStressRail />
          </div>
          <div className="col-span-12 xl:col-span-6">
            <ActiveOpportunities items={data.opportunities} highlightTitle={null} />
          </div>
        </div>
      </section>

      {/* Beyond your book — market-wide */}
      <section>
        <SectionLabel>Beyond your book — market-wide</SectionLabel>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          <Kpi k="Sources online" v={`${data.counts.sources_online}/${data.counts.sources_total}`} accent="var(--color-signal)"/>
          <Kpi k="Events tracked" v={String(data.counts.events_tracked)} />
          <Kpi k="Open opportunities" v={String(data.counts.open_opportunities)} accent="var(--color-opportunity)"/>
          <Kpi k="Active risks" v={String(data.counts.active_risks)} accent="var(--color-risk)"/>
          <Kpi k="Model confidence" v={data.system.model_health.toFixed(2)} accent="var(--color-reason)"/>
        </div>

        {/* Hero brain + side lists */}
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-3 order-2 xl:order-1 xl:h-[560px]">
            {/* left rail is now empty; graph stays centred */}
            <div className="hidden xl:block h-[560px]" />
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

        {/* Lower grid */}
        <div className="grid grid-cols-12 gap-5 mt-5">
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><InternationalData/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><LocalMarketFocus counts={data.counts}/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><LiveScanningBars/></div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3"><TrendSignals/></div>
        </div>

        <div className="grid grid-cols-12 gap-5 mt-5">
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
      </section>

      <footer className="pt-2 pb-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>Archlight · Live Intelligence Engine</span>
        <span>Public signals only · No buy · No sell · No target price</span>
      </footer>
    </AppShell>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground shrink-0">
        {children}
      </span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

function DoNextCard({ icon, title, line, to, action }: { icon: React.ReactNode; title: string; line: string; to: string; action: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border border-border/50 bg-background/30 hover:border-[color:var(--color-signal)]/40 transition">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-display text-sm font-medium">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{line}</p>
      <Link
        to={to}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-signal)] hover:underline"
      >
        {action}
      </Link>
    </div>
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

function directionColor(dir: string) {
  return dir === "risk" ? "var(--color-risk)" : dir === "opportunity" ? "var(--color-opportunity)" : "var(--color-signal)";
}

function directionBadge(dir: string) {
  const color = directionColor(dir);
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

  const riskCount = hits.filter((h) => h.direction === "risk").length;
  const oppCount = hits.filter((h) => h.direction === "opportunity").length;

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

      {!isLoading && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Kpi k="New hits" v={String(hits.length)} accent="var(--color-signal)"/>
            <Kpi k="To your risk" v={String(riskCount)} accent="var(--color-risk)"/>
            <Kpi k="Openings for you" v={String(oppCount)} accent="var(--color-opportunity)"/>
          </div>

          {hits.length === 0 ? (
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
          ) : (
            <div className="rounded-xl border border-border/50 bg-background/30 overflow-hidden">
              <ul className="divide-y divide-border/40">
                {hits.map((h) => {
                  const ev = eventMap.get(h.event_candidate_id);
                  const it = itemMap.get(h.exposure_item_id);
                  if (!ev || !it) return null;
                  const color = directionColor(h.direction ?? "mixed");
                  return (
                    <li key={h.id} className="group flex items-stretch hover:bg-muted/30 transition">
                      <div className="w-1 shrink-0 rounded-l" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0 p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {directionBadge(h.direction ?? "mixed")}
                          <span className="font-display text-sm font-medium">{it.name}</span>
                          <span className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border border-border/60 text-muted-foreground">
                            {it.kind}
                          </span>
                        </div>
                        <div className="text-xs text-foreground/90 mt-1 line-clamp-2">{ev.title}</div>
                        <div className="mt-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          via {h.match_kind}
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end justify-center gap-1 p-3 text-right">
                        <span className="font-display text-lg" style={{ color }}>
                          {(Number(h.relevance) * 100).toFixed(0)}%
                        </span>
                        <Link
                          to="/events/$id"
                          params={{ id: ev.id }}
                          onClick={() => seen.mutate(h.id)}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-[color:var(--color-signal)] hover:underline"
                        >
                          Investigate →
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
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

function RisingStressRail() {
  const { data, isLoading } = useQuery({
    queryKey: ["archlight", "rising-stress"],
    queryFn: () => getRisingStressRail(),
    staleTime: 30_000,
  });
  const rows = data?.rows ?? [];
  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>
        <h3 className="font-display text-sm tracking-wide">Rising stress</h3>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          belief state · your exposures
        </span>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="text-xs text-muted-foreground italic">
          No belief stress on tracked entities yet. Runs a scan and add exposures to populate.
        </div>
      )}
      {rows.length > 0 && (
        <ul className="grid md:grid-cols-2 xl:grid-cols-1 gap-2">
          {rows.map((r) => {
            const color = r.stress >= 0.66 ? "var(--color-risk)" : r.stress >= 0.34 ? "var(--color-signal)" : "var(--color-growth)";
            const arrow = r.trajectory > 0.02 ? <ArrowUp className="h-3 w-3"/> : r.trajectory < -0.02 ? <ArrowDown className="h-3 w-3"/> : <Minus className="h-3 w-3"/>;
            const trajColor = r.trajectory > 0.02 ? "var(--color-risk)" : r.trajectory < -0.02 ? "var(--color-growth)" : "var(--color-muted)";
            return (
              <li key={r.entity_id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                <Link to="/companies/$name" params={{ name: encodeURIComponent(r.name) }} className="block">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-sm truncate">{r.name}</span>
                    <span className="ml-auto font-mono text-sm" style={{ color }}>{Math.round(r.stress * 100)}%</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                    {r.sector && <span>{r.sector}</span>}
                    {r.region && <span>· {r.region}</span>}
                    <span className="ml-auto inline-flex items-center gap-1" style={{ color: trajColor }}>
                      {arrow}
                      {r.trajectory >= 0 ? "+" : ""}{(r.trajectory * 100).toFixed(0)}%
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
