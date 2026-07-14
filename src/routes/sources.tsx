import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { formatDateTimeUK } from "@/lib/format-datetime";
import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getSourceRegistry } from "@/lib/archlight/pipeline.functions";
import { applySourceSuggestion, dismissSourceSuggestion, listSourceSuggestions } from "@/lib/archlight/source-learning.functions";
import { Database, Sparkles } from "lucide-react";
import { toast } from "sonner";

const sourcesQuery = queryOptions({
  queryKey: ["archlight", "sources"],
  queryFn: () => getSourceRegistry(),
  staleTime: 30_000,
});
const suggestionsQuery = queryOptions({
  queryKey: ["archlight", "source-suggestions"],
  queryFn: () => listSourceSuggestions(),
  staleTime: 20_000,
});

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Source registry" },
      { name: "description", content: "Every source Arklight watches, its reliability, cadence, health, and last outcome. Public-information sources only." },
      { property: "og:title", content: "Project Arklight · Source registry" },
      { property: "og:description", content: "Reliability, cadence, and health for every source in the intelligence pipeline." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(sourcesQuery);
    context.queryClient.ensureQueryData(suggestionsQuery);
  },
  component: SourcesPage,
});

function SourcesPage() {
  const { data } = useSuspenseQuery(sourcesQuery);
  const { data: sugg } = useSuspenseQuery(suggestionsQuery);
  const router = useRouter();

  const applyMut = useMutation({
    mutationFn: (id: string) => applySourceSuggestion({ data: { id } }),
    onSuccess: (r) => { toast.success(`Applied · new reliability ${Number(r.applied_score).toFixed(2)}`); router.invalidate(); },
    onError: (e) => toast.error("Apply failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissSourceSuggestion({ data: { id } }),
    onSuccess: () => { toast.success("Suggestion dismissed"); router.invalidate(); },
    onError: (e) => toast.error("Dismiss failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Source registry</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
            <Database className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Sources
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Public-information sources Arklight watches. Reliability is learned; degraded sources are downweighted automatically.
          </p>
        </div>

        {/* Owner-gated reliability suggestions */}
        <section className="glass-panel rounded-xl overflow-hidden border-l-2" style={{ borderLeftColor: "var(--color-signal)" }}>
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
            <div>
              <div className="font-display text-sm">Reliability suggestions (owner-gated)</div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">
                Suggestions never apply themselves. Applying changes how future scans weigh this source.
              </div>
            </div>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{sugg.suggestions.length} open</span>
          </div>
          {sugg.suggestions.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground italic">
              No open suggestions. New nudges appear here once a source has supported enough resolved predictions to shift its accuracy.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {sugg.suggestions.map((s) => {
                const direction = Number(s.suggested_score) > Number(s.current_score) ? "up" : "down";
                const c = direction === "up" ? "var(--color-growth)" : "var(--color-risk)";
                return (
                  <li key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link to="/sources/$id" params={{ id: s.source_id }} className="font-display text-sm hover:text-[color:var(--color-signal)]">{s.source_name}</Link>
                          {s.source_type && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{s.source_type}</span>}
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {Number(s.current_score).toFixed(2)} → <span style={{ color: c }}>{Number(s.suggested_score).toFixed(2)}</span>
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">accuracy · {Math.round(Number(s.accuracy_score) * 100)}%</span>
                          <span className="text-[10px] font-mono text-muted-foreground">n · {s.claims_seen} ({s.claims_confirmed}✓ / {s.claims_contested}✗)</span>
                        </div>
                        <p className="text-xs mt-2 text-muted-foreground">{s.rationale}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => applyMut.mutate(s.id)}
                          disabled={applyMut.isPending || dismissMut.isPending}
                          className="h-8 px-3 rounded-md text-[11px] font-mono uppercase tracking-widest border transition disabled:opacity-50"
                          style={{ borderColor: "var(--color-signal)", color: "var(--color-signal)" }}
                        >Apply</button>
                        <button
                          onClick={() => dismissMut.mutate(s.id)}
                          disabled={applyMut.isPending || dismissMut.isPending}
                          className="h-8 px-3 rounded-md text-[11px] font-mono uppercase tracking-widest border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition disabled:opacity-50"
                        >Dismiss</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/40">
              <tr>
                <Th>Name</Th><Th>Publisher</Th><Th>Type</Th><Th>Status</Th><Th>Reliability</Th><Th>Health</Th><Th>Cadence</Th><Th>Last success</Th><Th>Last failure</Th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id} className="border-t border-border/40 hover:bg-accent/20">
                  <Td>
                    <Link to="/sources/$id" params={{ id: s.id }} className="font-display text-sm hover:text-[color:var(--color-signal)]">{s.name}</Link>
                    {s.base_url && <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[280px]">{s.base_url}</div>}
                  </Td>
                  <Td className="font-mono text-[10px] text-muted-foreground">{(s as { independence_group?: string | null }).independence_group ?? "—"}</Td>
                  <Td><Badge>{s.source_type}</Badge></Td>
                  <Td><StatusBadge s={s.status}/></Td>
                  <Td><Bar v={Number(s.reliability_score)} c="var(--color-signal)"/></Td>
                  <Td><Bar v={Number(s.health_score)} c="var(--color-growth)"/></Td>
                  <Td className="font-mono">{s.refresh_cadence_minutes}m</Td>
                  <Td className="text-muted-foreground">{s.last_success_at ? formatDateTimeUK(s.last_success_at) : "—"}</Td>
                  <Td className="text-muted-foreground">{s.last_failure_at ? formatDateTimeUK(s.last_failure_at) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="text-left px-3 py-2">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{children}</span>; }
function StatusBadge({ s }: { s: string }) {
  const c = s === "active" ? "var(--color-growth)" : s === "degraded" ? "var(--color-opportunity)" : "var(--color-risk)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{s}</span>;
}
function Bar({ v, c }: { v: number; c: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.round(v * 100)}%`, background: c }}/>
      </div>
      <span className="font-mono text-[10px] w-8 text-right">{v.toFixed(2)}</span>
    </div>
  );
}
