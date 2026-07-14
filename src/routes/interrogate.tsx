import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { formatDateUK, formatDateTimeUK } from "@/lib/format-datetime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/archlight/AppShell";
import { StockChart } from "@/components/archlight/StockChart";
import { interrogate, getWatchlists, createWatchlist, addToWatchlist } from "@/lib/archlight/pipeline.functions";
import { getChartTickers } from "@/lib/archlight/precognition.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Building2, Newspaper, Radar, Users, Wrench, Eye, HelpCircle, LineChart, BookmarkPlus, Check } from "lucide-react";
import { toast } from "sonner";

type SearchParams = { q?: string };
type InterrogationResult = Awaited<ReturnType<typeof interrogate>>;
type DeepReport = InterrogationResult["report"];

export const Route = createFileRoute("/interrogate")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Interrogate a subject in depth" },
      { name: "description", content: "Deep public-signal interrogation: live news, financial context, leadership moves, impacted entities, second-order effects, and multi-horizon scenarios grounded in cited sources." },
      { property: "og:title", content: "Project Arklight · Interrogate" },
      { property: "og:description", content: "Ask Arklight about any company, country, commodity, sector, or theme." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: InterrogatePage,
});

function InterrogatePage() {
  const router = useRouter();
  const { q } = Route.useSearch();
  const [input, setInput] = useState(q ?? "");
  const [result, setResult] = useState<InterrogationResult | null>(null);
  const lastAutoQuery = useRef<string | null>(null);

  const mut = useMutation({
    mutationFn: (vars: { query: string; forceRefresh?: boolean }) => interrogate({ data: vars }),
    onSuccess: (r) => setResult(r),
    onError: (e) => toast.error("Interrogation failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  useEffect(() => {
    setInput(q ?? "");
    setResult(null);
    const clean = q?.trim() ?? "";
    if (clean && lastAutoQuery.current !== clean) {
      lastAutoQuery.current = clean;
      mut.mutate({ query: clean });
    }
  }, [q]);

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-5 min-w-0">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Explore · Research</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">Research a subject</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Ask about any company, country, commodity, sector, ticker, person or theme. Arklight pulls live public sources, traces them, and writes a cited brief — it won't invent facts it can't source.
          </p>
          <div className="mt-3 inline-flex items-center p-1 rounded-full border border-border/50 bg-muted/40">
            <Link to="/interrogate" className="px-3 py-1.5 text-xs rounded-full bg-primary text-primary-foreground shadow-sm">Research</Link>
            <Link to="/interrogations" className="px-3 py-1.5 text-xs rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/50">History</Link>
          </div>
        </div>


        <form
          className="glass-panel rounded-lg p-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = input.trim();
            if (!v) return;
            router.navigate({ to: "/interrogate", search: { q: v } });
          }}
        >
          <Search className="h-4 w-4 text-muted-foreground ml-2 shrink-0"/>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. BlackRock, Rolls Royce, lithium, Brazil coffee, US Iran, defence sector"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={mut.isPending || !input.trim()}
            className="h-9 px-4 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 ring-signal disabled:opacity-50 shrink-0"
          >
            {mut.isPending ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Interrogating…</span> : "Interrogate"}
          </button>
        </form>

        {mut.isPending && (
          <BuildProgress query={mut.variables?.query ?? q ?? input}/>
        )}

        {!result && !mut.isPending && (
          <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">
            Enter a query to begin. Every finding is hedged, evidence-grounded, and passes the financial-advice guardrail.
          </div>
        )}

        {result && <DeepReportView result={result} query={q ?? input} onRefresh={() => {
          const query = (q ?? input).trim();
          if (!query) return;
          lastAutoQuery.current = query;
          setResult(null);
          mut.mutate({ query, forceRefresh: true });
        }}/>}
      </div>
    </AppShell>
  );
}

function BuildProgress({ query }: { query: string }) {
  const stages = [
    "Checking the one-week report cache",
    "Classifying the subject and market universe",
    "Retrieving live public news and local evidence",
    "Mapping impacted entities and second-order effects",
    "Synthesising risks, opportunities and forward scenarios",
    "Applying evidence citations and guardrails",
  ];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [query]);

  const active = Math.min(stages.length - 1, Math.floor(elapsed / 4));
  const progress = Math.min(92, 10 + elapsed * 4);

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-4 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 className="h-5 w-5 animate-spin shrink-0"/>
          <div className="min-w-0">
            <div className="font-display text-foreground break-words">Building interrogation report for {query}</div>
            <div className="text-[11px] font-mono uppercase tracking-widest">{stages[active]}</div>
          </div>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest">{elapsed}s elapsed</div>
      </div>
      <div className="h-1.5 rounded-full bg-background/60 overflow-hidden border border-border/50">
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: "var(--color-signal)" }}/>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {stages.map((stage, i) => (
          <li key={stage} className={`rounded border px-2 py-1.5 text-[11px] ${i <= active ? "border-[color:var(--color-signal)]/50 text-foreground bg-background/40" : "border-border/40 bg-background/20"}`}>
            {i < active ? "✓" : i === active ? "◆" : "◇"} {stage}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Strip stray JSON artefacts that occasionally leak from the LLM when a nested
 * object was serialised into a text field — e.g. `{"earnings_and_guidance":"...` at
 * the start of a paragraph or a dangling `"}` at the end.
 */
function sanitizeText(s: string): string {
  let out = s;
  // Leading `{"key":"` or `{"key": "`
  out = out.replace(/^\s*\{\s*"[a-z0-9_\- ]+"\s*:\s*"?/i, "");
  // Trailing `"}` / `" }` / dangling closing braces after the last quote
  out = out.replace(/"?\s*\}\s*$/g, "");
  // Escaped newlines / quotes from JSON
  out = out.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\t/g, " ");
  // Mid-string `", "next_key": "` fragments — flatten to a sentence break
  out = out.replace(/",\s*"[a-z0-9_\- ]+"\s*:\s*"/gi, " — ");
  return out.trim();
}

function coerce(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return sanitizeText(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(coerce).filter(Boolean).join(" · ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return sanitizeText(o.name);
    if (typeof o.title === "string") return sanitizeText(o.title);
    if (typeof o.label === "string") return sanitizeText(o.label);
    if (typeof o.description === "string") return sanitizeText(o.description);
    try { return sanitizeText(JSON.stringify(v)); } catch { return String(v); }
  }
  return String(v);
}

function formatUtcDateTime(value: string | null | undefined, withTime = true): string {
  if (!value) return "recently";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "recently";
  return withTime ? formatDateTimeUK(d) : formatDateUK(d);
}

function DeepReportView({ result, query, onRefresh }: { result: InterrogationResult; query: string; onRefresh: () => void }) {
  const r: DeepReport = result.report;
  const src = result.live_sources;
  const cite = (indices: number[] | undefined) => (indices ?? []).map((i) => src.find((x) => x.idx === i)).filter(Boolean);
  const [tab, setTab] = useState("overview");

  // Lazily resolve tickers for chart tab
  const chartQ = useQuery({
    queryKey: ["chart-tickers", result.subject.canonical || query],
    queryFn: () => getChartTickers({ data: { query: result.subject.canonical || query } }),
    enabled: tab === "market",
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Header meta — always visible */}
      <section className="glass-panel rounded-xl p-4 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground min-w-0">
            <span>subject · <span className="text-[color:var(--color-signal)]">{result.subject.kind}</span></span>
            <span className="break-all">canonical · {result.subject.canonical}</span>
            <span>live sources · {src.length}</span>
            <span>queries · {result.queries_used.length}</span>
            <span>model · {result.model}</span>
            <span>confidence · {Math.round((r.confidence_overall ?? 0) * 100)}</span>
          </div>
          <WatchlistButton value={result.subject.canonical || query} kind={result.subject.kind === "region" ? "region" : "keyword"}/>
        </div>
        {r.subject_profile && <p className="mt-3 text-sm leading-relaxed break-words">{coerce(r.subject_profile)}</p>}
        {r.evidence_coverage && <p className="mt-2 text-[11px] italic text-muted-foreground break-words">Evidence coverage · {coerce(r.evidence_coverage)}</p>}
      </section>

      {result.cache?.cached && (
        <div className="rounded-lg border border-[color:var(--color-signal)]/40 bg-background/40 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="break-words">
            Cached report · generated {formatUtcDateTime(result.cache.created_at)}. Fresh synthesis will run automatically after one week{result.cache.expires_at ? ` (${formatUtcDateTime(result.cache.expires_at, false)})` : ""}.
          </span>
          <button type="button" onClick={onRefresh} className="shrink-0 rounded border border-[color:var(--color-signal)]/60 px-2 py-1 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10">
            Run fresh interrogation
          </button>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-background/40 border border-border/40 p-1 rounded-lg">
          <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><Radar className="h-3.5 w-3.5 mr-1.5"/>Overview</TabsTrigger>
          <TabsTrigger value="market" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><LineChart className="h-3.5 w-3.5 mr-1.5"/>Market</TabsTrigger>
          <TabsTrigger value="developments" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><Newspaper className="h-3.5 w-3.5 mr-1.5"/>Developments</TabsTrigger>
          <TabsTrigger value="impact" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><Building2 className="h-3.5 w-3.5 mr-1.5"/>Impact map</TabsTrigger>
          <TabsTrigger value="scenarios" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><AlertTriangle className="h-3.5 w-3.5 mr-1.5"/>Risks &amp; scenarios</TabsTrigger>
          <TabsTrigger value="sources" className="text-xs data-[state=active]:bg-[color:var(--color-signal)]/15 data-[state=active]:text-[color:var(--color-signal)]"><ExternalLink className="h-3.5 w-3.5 mr-1.5"/>Sources ({src.length})</TabsTrigger>
        </TabsList>

        {/* --- OVERVIEW --- */}
        <TabsContent value="overview" className="mt-4 flex flex-col gap-4 min-w-0">
          {r.what_is_happening_now && (
            <Panel icon={<Radar className="h-4 w-4"/>} title="What is happening now">
              <p className="text-sm leading-relaxed break-words">{coerce(r.what_is_happening_now)}</p>
            </Panel>
          )}
          {(r.financial_and_market || r.leadership_and_org || r.operational_and_projects) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
              {r.financial_and_market && <MiniPanel icon={<TrendingUp className="h-3.5 w-3.5"/>} title="Financial & market">{coerce(r.financial_and_market)}</MiniPanel>}
              {r.leadership_and_org && <MiniPanel icon={<Users className="h-3.5 w-3.5"/>} title="Leadership & org">{coerce(r.leadership_and_org)}</MiniPanel>}
              {r.operational_and_projects && <MiniPanel icon={<Wrench className="h-3.5 w-3.5"/>} title="Operations & projects">{coerce(r.operational_and_projects)}</MiniPanel>}
            </div>
          )}
          {r.what_to_watch?.length > 0 && (
            <Panel icon={<Eye className="h-4 w-4"/>} title="What to watch">
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                {r.what_to_watch.map((w, i) => (
                  <li key={i} className="text-xs px-2 py-1.5 rounded border border-border/50 bg-background/30 break-words">◇ {coerce(w)}</li>
                ))}
              </ul>
            </Panel>
          )}
          {r.caveats?.length > 0 && (
            <div className="text-[11px] text-muted-foreground italic px-1 break-words">
              <span className="font-display text-foreground/80 not-italic">Caveats:</span> {r.caveats.join(" · ")}
            </div>
          )}
        </TabsContent>

        {/* --- MARKET --- */}
        <TabsContent value="market" className="mt-4 flex flex-col gap-4 min-w-0">
          {chartQ.isLoading && (
            <div className="glass-panel rounded-xl p-8 flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin"/>Resolving primary listing…
            </div>
          )}
          {chartQ.data?.primary && (
            <StockChart primary={chartQ.data.primary} competitors={chartQ.data.competitors}/>
          )}
          {chartQ.data && !chartQ.data.primary && (
            <div className="glass-panel rounded-xl p-8 text-sm text-muted-foreground text-center">
              No listed ticker resolved for this subject. Market chart is only available when the subject maps to a publicly listed entity in the Arklight universe.
            </div>
          )}
          {r.financial_and_market && (
            <Panel icon={<TrendingUp className="h-4 w-4"/>} title="Financial & market context">
              <p className="text-sm leading-relaxed break-words">{coerce(r.financial_and_market)}</p>
            </Panel>
          )}
        </TabsContent>

        {/* --- DEVELOPMENTS --- */}
        <TabsContent value="developments" className="mt-4 flex flex-col gap-4 min-w-0">
          {r.key_developments?.length > 0 ? (
            <Panel icon={<Newspaper className="h-4 w-4"/>} title="Key developments">
              <ul className="space-y-3">
                {r.key_developments.map((d, i) => (
                  <li key={i} className="border-l-2 border-[color:var(--color-signal)]/50 pl-3 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-sm font-display break-words min-w-0 flex-1">{coerce(d.headline)}</div>
                      {d.date && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{d.date}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{coerce(d.detail)}</p>
                    <SourceChips items={cite(d.source_indices)}/>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <EmptyPanel text="No key developments synthesised."/>
          )}
          {result.events.length > 0 && (
            <Panel icon={<Radar className="h-4 w-4"/>} title={`Local Arklight events (${result.events.length})`}>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.events.map((e) => (
                  <li key={coerce(e.id)} className="rounded border border-border/50 bg-background/30 p-2.5 min-w-0">
                    <Link to="/events/$id" params={{ id: coerce(e.id) }} className="block hover:text-[color:var(--color-signal)]">
                      <div className="text-xs break-words">{coerce(e.title)}</div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">
                        {coerce(e.event_class)} · {coerce(e.affected_sector) || "—"} · risk {Math.round(Number(e.risk_score) * 100)} · opp {Math.round(Number(e.opportunity_score) * 100)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </TabsContent>

        {/* --- IMPACT MAP --- */}
        <TabsContent value="impact" className="mt-4 flex flex-col gap-4 min-w-0">
          {r.directly_impacted_entities?.length > 0 && (
            <Panel icon={<Building2 className="h-4 w-4"/>} title="Directly impacted entities">
              <ul className="divide-y divide-border/40">
                {r.directly_impacted_entities.map((e, i) => (
                  <li key={i} className="py-2.5 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-display flex flex-wrap items-center gap-2 break-words">
                          <DirectionBadge dir={e.direction}/>
                          <SubjectLink name={coerce(e.name)}/>
                          <span className="text-[10px] font-mono text-muted-foreground">{coerce(e.kind)}</span>
                          <WatchlistButton value={coerce(e.name)} kind={watchlistKindFor(coerce(e.kind))} compact/>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 break-words">{coerce(e.mechanism)}</p>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground text-right shrink-0">
                        <div>mag · {coerce(e.magnitude)}</div>
                        <div>conf · {Math.round(Number(e.confidence) * 100)}</div>
                      </div>
                    </div>
                    <SourceChips items={cite(e.source_indices)}/>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {r.second_order_effects?.length > 0 && (
            <Panel icon={<Radar className="h-4 w-4"/>} title="Second-order effects">
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {r.second_order_effects.map((e, i) => (
                  <li key={i} className="rounded border border-border/50 bg-background/30 p-2.5 min-w-0">
                    <div className="text-xs font-display flex flex-wrap items-center gap-2 break-words">
                      <DirectionBadge dir={e.direction}/>
                      <SubjectLink name={coerce(e.name)}/>
                      <span className="text-[10px] font-mono text-muted-foreground">{coerce(e.kind)}</span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground">{Math.round(Number(e.confidence) * 100)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 break-words">{coerce(e.mechanism)}</p>
                    <div className="mt-1.5"><WatchlistButton value={coerce(e.name)} kind={watchlistKindFor(coerce(e.kind))} compact/></div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {result.impacts.length > 0 && (
            <Panel icon={<Building2 className="h-4 w-4"/>} title={`Local company impacts (${result.impacts.length})`}>
              <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {result.impacts.map((i) => (
                  <li key={coerce(i.id)} className="rounded border border-border/40 bg-background/30 p-2.5 min-w-0">
                    <div className="text-xs font-display break-words">{coerce(i.company_name)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">
                      {coerce(i.impact_type)} · risk {Math.round(Number(i.risk_score) * 100)} · opp {Math.round(Number(i.opportunity_score) * 100)}
                    </div>
                    {!!coerce(i.impact_pathway) && <p className="text-[11px] text-muted-foreground mt-1 break-words line-clamp-3">{coerce(i.impact_pathway)}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {!r.directly_impacted_entities?.length && !r.second_order_effects?.length && !result.impacts.length && <EmptyPanel text="No impact mapping produced."/>}
        </TabsContent>

        {/* --- SCENARIOS / RISKS --- */}
        <TabsContent value="scenarios" className="mt-4 flex flex-col gap-4 min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
            {r.risks?.length > 0 && (
              <Panel icon={<AlertTriangle className="h-4 w-4" style={{ color: "var(--color-risk)" }}/>} title="Risks">
                <RankList items={r.risks} kind="risk" cite={cite}/>
              </Panel>
            )}
            {r.opportunities?.length > 0 && (
              <Panel icon={<TrendingUp className="h-4 w-4" style={{ color: "var(--color-opportunity)" }}/>} title="Opportunities">
                <RankList items={r.opportunities} kind="opp" cite={cite}/>
              </Panel>
            )}
          </div>

          {r.scenarios?.length > 0 && (
            <Panel icon={<Radar className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>} title="Forward scenarios">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...r.scenarios].sort((a, b) => (HORIZON_ORDER[a.horizon] ?? 9) - (HORIZON_ORDER[b.horizon] ?? 9)).map((sc, i) => (
                  <li key={i} className="rounded border border-border/50 bg-background/30 p-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-display break-words min-w-0 flex-1">{coerce(sc.label)}</div>
                      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground shrink-0">
                        <span className="px-1.5 py-0.5 rounded border border-border/50">{coerce(sc.horizon)}</span>
                        <span>p={Number(sc.probability ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-words">{coerce(sc.description)}</p>
                    {sc.leading_indicators?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {sc.leading_indicators.map((li, j) => (
                          <span key={j} className="text-[10px] px-1.5 py-0.5 rounded border border-border/50 bg-background/40 break-words">◇ {coerce(li)}</span>
                        ))}
                      </div>
                    )}
                    <SourceChips items={cite(sc.source_indices)}/>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {r.contrarian_or_speculative?.length > 0 && (
            <Panel icon={<HelpCircle className="h-4 w-4"/>} title="Contrarian / rumor / speculative">
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {r.contrarian_or_speculative.map((c, i) => (
                  <li key={i} className="rounded border border-dashed border-border/60 bg-background/30 p-3 min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-xs font-display break-words min-w-0 flex-1">{coerce(c.claim)}</div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">{coerce(c.verification_status)}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 break-words">{coerce(c.why_it_matters)}</p>
                    <SourceChips items={cite(c.source_indices)}/>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </TabsContent>

        {/* --- SOURCES --- */}
        <TabsContent value="sources" className="mt-4 flex flex-col gap-4 min-w-0">
          <Panel icon={<Newspaper className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>} title={`Live sources (${src.length})`}>
            <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {src.map((s) => (
                <li key={s.idx} className="text-xs min-w-0">
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="group block hover:bg-accent/30 px-2 py-2 rounded border border-border/40 bg-background/30 h-full">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">[{s.idx}]</span>
                      <span className="line-clamp-3 group-hover:text-[color:var(--color-signal)] break-words min-w-0">{s.title}</span>
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-1 break-words">
                      {s.source} · {s.publishedAt ? formatUtcDateTime(s.publishedAt, false) : "—"} · <span className="italic">"{s.query}"</span>
                    </div>
                  </a>
                </li>
              ))}
              {src.length === 0 && <li className="text-xs italic text-muted-foreground py-3">No live news pulled — falling back on internal evidence only.</li>}
            </ol>
          </Panel>
          {result.queries_used.length > 0 && (
            <Panel icon={<Search className="h-4 w-4"/>} title="Queries fired">
              <ul className="flex flex-wrap gap-1.5">
                {result.queries_used.map((qq, i) => (
                  <li key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 bg-background/30 break-words">{qq}</li>
                ))}
              </ul>
            </Panel>
          )}
        </TabsContent>
      </Tabs>

      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-1">
        Not financial advice · public signals only · no buy · no sell · no target price
      </div>
    </div>
  );
}

const HORIZON_ORDER: Record<string, number> = { "0-7d": 0, "8-30d": 1, "1-3mo": 2, "3-12mo": 3 };

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-xl p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-display text-sm">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground italic text-center">{text}</div>;
}

function MiniPanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
        {icon}{title}
      </div>
      <p className="text-xs leading-relaxed break-words">{children}</p>
    </div>
  );
}

function DirectionBadge({ dir }: { dir: string }) {
  const map: Record<string, { color: string; label: string; Icon: typeof TrendingUp }> = {
    benefit: { color: "var(--color-opportunity)", label: "benefit", Icon: TrendingUp },
    harm: { color: "var(--color-risk)", label: "harm", Icon: TrendingDown },
    mixed: { color: "var(--color-reason)", label: "mixed", Icon: Radar },
    unclear: { color: "var(--muted-foreground)", label: "unclear", Icon: HelpCircle },
  };
  const cfg = map[dir] ?? map.unclear;
  const Icon = cfg.Icon;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0" style={{ borderColor: cfg.color, color: cfg.color }}>
      <Icon className="h-3 w-3"/>{cfg.label}
    </span>
  );
}

function SourceChips({ items }: { items: Array<{ idx: number; title: string; link: string; source: string } | undefined> }) {
  const valid = items.filter((x): x is { idx: number; title: string; link: string; source: string } => !!x);
  if (!valid.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {valid.map((s) => (
        <a key={s.idx} href={s.link} target="_blank" rel="noopener noreferrer" title={`${s.source} — ${s.title}`} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 bg-background/30 hover:bg-accent/40 hover:text-[color:var(--color-signal)]">
          [{s.idx}]
        </a>
      ))}
    </div>
  );
}

function RankList({ items, kind, cite }: {
  items: Array<{ title: string; description: string; likelihood: number; magnitude: string; horizon: string; source_indices: number[] }>;
  kind: "risk" | "opp";
  cite: (indices: number[] | undefined) => Array<{ idx: number; title: string; link: string; source: string } | undefined>;
}) {
  const color = kind === "risk" ? "var(--color-risk)" : "var(--color-opportunity)";
  return (
    <ul className="space-y-2">
      {[...items].sort((a, b) => (b.likelihood ?? 0) - (a.likelihood ?? 0)).map((it, i) => (
        <li key={i} className="rounded border border-border/50 bg-background/30 p-2.5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-display break-words min-w-0 flex-1">{coerce(it.title)}</div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0" style={{ color }}>
              <span>p={Number(it.likelihood ?? 0).toFixed(2)}</span>
              <span className="px-1 py-0.5 rounded border" style={{ borderColor: color }}>{coerce(it.magnitude)}</span>
              <span className="px-1 py-0.5 rounded border border-border/50 text-muted-foreground">{coerce(it.horizon)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 break-words">{coerce(it.description)}</p>
          <SourceChips items={cite(it.source_indices)}/>
        </li>
      ))}
    </ul>
  );
}

// ----- Subject linking + watchlist controls -----

function watchlistKindFor(kind: string): "keyword" | "sector" | "region" {
  const k = (kind || "").toLowerCase();
  if (k.includes("region") || k.includes("country") || k.includes("geograph")) return "region";
  if (k.includes("sector") || k.includes("industry")) return "sector";
  return "keyword";
}

function SubjectLink({ name }: { name: string }) {
  const clean = (name || "").trim();
  if (!clean) return null;
  return (
    <Link
      to="/interrogate"
      search={{ q: clean }}
      className="break-words min-w-0 underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-signal)]"
      title={`Interrogate ${clean}`}
    >
      {clean}
    </Link>
  );
}

function WatchlistButton({ value, kind, compact = false }: { value: string; kind: "keyword" | "sector" | "region"; compact?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const clean = (value || "").trim();
  const wq = useQuery({
    queryKey: ["archlight", "watchlists"],
    queryFn: () => getWatchlists(),
    enabled: open,
    staleTime: 30_000,
  });
  const add = useMutation({
    mutationFn: (watchlist_id: string) => addToWatchlist({ data: { watchlist_id, kind, value: clean } }),
    onSuccess: (r) => {
      toast.success(r.added ? `Added to “${r.watchlist_name}”` : `Already in “${r.watchlist_name}”`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["archlight", "watchlists"] });
    },
    onError: (e) => toast.error("Failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const create = useMutation({
    mutationFn: async (name: string) => {
      const patch: { name: string; sectors: string[]; regions: string[]; keywords: string[]; min_risk: number; min_opportunity: number; min_confidence: number } = {
        name, sectors: [], regions: [], keywords: [], min_risk: 0, min_opportunity: 0, min_confidence: 0,
      };
      if (kind === "sector") patch.sectors = [clean];
      else if (kind === "region") patch.regions = [clean];
      else patch.keywords = [clean];
      return createWatchlist({ data: patch });
    },
    onSuccess: () => {
      toast.success(`Created watchlist with “${clean}”`);
      setNewName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["archlight", "watchlists"] });
    },
    onError: (e) => toast.error("Failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (!clean) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded border border-border/60 bg-background/40 hover:border-[color:var(--color-signal)]/60 hover:text-[color:var(--color-signal)] ${compact ? "text-[10px] font-mono px-1.5 py-0.5" : "text-[11px] px-2 py-1"}`}
        title="Add to watchlist"
      >
        <BookmarkPlus className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}/>
        {compact ? "watch" : "Add to watchlist"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border/60 bg-background/95 backdrop-blur p-2 shadow-lg">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Add “{clean}” as {kind}</div>
          {wq.isLoading && <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-2"><Loader2 className="h-3 w-3 animate-spin"/>loading…</div>}
          <ul className="max-h-40 overflow-auto space-y-1">
            {(wq.data?.watchlists ?? []).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => add.mutate(w.id)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent/40 flex items-center gap-1.5"
                >
                  <Check className="h-3 w-3 opacity-60"/>{w.name}
                </button>
              </li>
            ))}
            {wq.data && wq.data.watchlists.length === 0 && (
              <li className="text-[11px] italic text-muted-foreground px-1">No watchlists yet — create one below.</li>
            )}
          </ul>
          <form
            className="mt-2 flex items-center gap-1 border-t border-border/40 pt-2"
            onSubmit={(ev) => { ev.preventDefault(); if (newName.trim()) create.mutate(newName.trim()); }}
          >
            <input
              value={newName}
              onChange={(ev) => setNewName(ev.target.value)}
              placeholder="New watchlist name"
              className="flex-1 min-w-0 h-7 px-2 rounded border border-border/60 bg-background/50 text-xs"
            />
            <button
              type="submit"
              disabled={create.isPending || !newName.trim()}
              className="h-7 px-2 rounded border border-[color:var(--color-signal)]/60 text-[10px] text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
            >
              {create.isPending ? "…" : "Create"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

