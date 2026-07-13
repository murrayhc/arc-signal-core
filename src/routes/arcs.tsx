import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getEvidenceArcs } from "@/lib/archlight/pipeline.functions";
import { GitBranch, Loader2 } from "lucide-react";

export const Route = createFileRoute("/arcs")({
  head: () => ({
    meta: [
      { title: "Arklight · Evidence arcs" },
      { name: "description", content: "Persisted source → claim → event → impact story lines with true-potential, momentum, contradiction and source-diversity scores." },
      { property: "og:title", content: "Arklight · Evidence arcs" },
      { property: "og:description", content: "Traceable story lines across public signals." },
    ],
  }),
  component: ArcsPage,
});

function ArcsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["archlight", "arcs"], queryFn: () => getEvidenceArcs() });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <header>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2"><GitBranch className="h-3 w-3"/> evidence arcs</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">Story lines from source to consequence</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Each arc is the persisted chain: sources → atomic claims → event candidate → company impact → optional opportunity. Scored on true potential, source diversity, contradictions, and momentum.</p>
        </header>

        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}

        {data && (
          <ul className="grid md:grid-cols-2 gap-3">
            {data.arcs.map((a) => (
              <li key={a.id} className="glass-panel rounded-xl p-4 hover:ring-signal transition">
                <Link to="/arcs/$id" params={{ id: a.id }} className="block">
                  <div className="font-display text-sm">{a.title}</div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <MiniMetric k="Potential" v={Math.round(Number(a.true_potential_score) * 100)} c="var(--color-signal)"/>
                    <MiniMetric k="Diversity" v={Math.round(Number(a.source_diversity) * 100)}/>
                    <MiniMetric k="Momentum" v={Math.round(Number(a.momentum_score) * 100)}/>
                    <MiniMetric k="Contra" v={Math.round(Number(a.contradiction_score) * 100)} c={Number(a.contradiction_score) > 0.3 ? "var(--color-risk)" : undefined}/>
                  </div>
                </Link>
              </li>
            ))}
            {!data.arcs.length && <li className="col-span-2 glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground italic">No arcs yet. Run a scan.</li>}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function MiniMetric({ k, v, c }: { k: string; v: number; c?: string }) {
  return (
    <div className="rounded border border-border/40 p-1.5 bg-background/30">
      <div className="font-display text-sm leading-none" style={c ? { color: c } : undefined}>{v}</div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{k}</div>
    </div>
  );
}
