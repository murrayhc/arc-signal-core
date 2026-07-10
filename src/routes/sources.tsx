import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getSourceRegistry } from "@/lib/archlight/pipeline.functions";
import { Database } from "lucide-react";

const sourcesQuery = queryOptions({
  queryKey: ["archlight", "sources"],
  queryFn: () => getSourceRegistry(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Archlight · Source registry" },
      { name: "description", content: "Every source Archlight watches, its reliability, cadence, health, and last outcome. Public-information sources only." },
      { property: "og:title", content: "Archlight · Source registry" },
      { property: "og:description", content: "Reliability, cadence, and health for every source in the intelligence pipeline." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sourcesQuery),
  component: SourcesPage,
});

function SourcesPage() {
  const { data } = useSuspenseQuery(sourcesQuery);
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Source registry</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
            <Database className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Sources
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Public-information sources Archlight watches. Reliability is learned; degraded sources are downweighted automatically.
          </p>
        </div>

        <div className="glass-panel rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/40">
              <tr>
                <Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>Reliability</Th><Th>Health</Th><Th>Cadence</Th><Th>Last success</Th><Th>Last failure</Th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id} className="border-t border-border/40 hover:bg-accent/20">
                  <Td>
                    <Link to="/sources/$id" params={{ id: s.id }} className="font-display text-sm hover:text-[color:var(--color-signal)]">{s.name}</Link>
                    {s.base_url && <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[280px]">{s.base_url}</div>}
                  </Td>
                  <Td><Badge>{s.source_type}</Badge></Td>
                  <Td><StatusBadge s={s.status}/></Td>
                  <Td><Bar v={Number(s.reliability_score)} c="var(--color-signal)"/></Td>
                  <Td><Bar v={Number(s.health_score)} c="var(--color-growth)"/></Td>
                  <Td className="font-mono">{s.refresh_cadence_minutes}m</Td>
                  <Td className="text-muted-foreground">{s.last_success_at ? new Date(s.last_success_at).toLocaleString() : "—"}</Td>
                  <Td className="text-muted-foreground">{s.last_failure_at ? new Date(s.last_failure_at).toLocaleString() : "—"}</Td>
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
