import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getEvidenceArcDetail } from "@/lib/archlight/pipeline.functions";
import { ArrowLeft, GitBranch, Loader2 } from "lucide-react";

export const Route = createFileRoute("/arcs/$id")({
  head: () => ({
    meta: [
      { title: "Archlight · Evidence arc detail" },
      { name: "description", content: "Full evidence arc: every degree of separation from source through claim to consequence." },
      { property: "og:title", content: "Archlight · Evidence arc detail" },
      { property: "og:description", content: "Traceable story line from source to consequence." },
    ],
  }),
  component: ArcDetailPage,
});

const stepColor = (n: string) =>
  n === "source" ? "var(--color-muted-foreground)"
  : n === "claim" ? "var(--color-reason)"
  : n === "event" ? "var(--color-signal)"
  : n === "company" ? "var(--color-opportunity)"
  : n === "opportunity" ? "var(--color-opportunity)"
  : "var(--color-muted-foreground)";

function ArcDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["archlight", "arc", id],
    queryFn: () => getEvidenceArcDetail({ data: { id } }),
  });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit"><ArrowLeft className="h-3.5 w-3.5"/>Back</button>
        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}
        {data?.arc && (
          <>
            <header className="glass-panel rounded-xl p-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><GitBranch className="h-3 w-3"/> evidence arc</div>
              <h1 className="font-display text-2xl mt-1">{data.arc.title}</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{data.arc.summary}</p>
              <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
                <Metric k="Potential" v={String(Math.round(Number(data.arc.true_potential_score) * 100))} c="var(--color-signal)"/>
                <Metric k="Confidence" v={String(Math.round(Number(data.arc.confidence) * 100))}/>
                <Metric k="Origin str" v={String(Math.round(Number(data.arc.origin_strength) * 100))}/>
                <Metric k="Diversity" v={String(Math.round(Number(data.arc.source_diversity) * 100))}/>
                <Metric k="Momentum" v={String(Math.round(Number(data.arc.momentum_score) * 100))}/>
                <Metric k="Contra" v={String(Math.round(Number(data.arc.contradiction_score) * 100))} c={Number(data.arc.contradiction_score) > 0.3 ? "var(--color-risk)" : undefined}/>
              </div>
            </header>

            <section className="glass-panel rounded-xl p-4">
              <h2 className="font-display text-sm mb-3">Steps ({data.steps.length})</h2>
              <ol className="relative border-l border-border/50 ml-2 space-y-3 pl-4">
                {data.steps.map((s) => (
                  <li key={s.id}>
                    <div className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full" style={{ background: stepColor(s.node_type) }}/>
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <span>deg {s.degree}</span>
                      <span style={{ color: stepColor(s.node_type) }}>{s.node_type}</span>
                      {s.relationship_type && <span>· {s.relationship_type}</span>}
                      <span className="ml-auto">conf {Number(s.confidence).toFixed(2)}</span>
                    </div>
                    <div className="text-sm mt-0.5">{s.explanation}</div>
                  </li>
                ))}
                {!data.steps.length && <div className="text-xs italic text-muted-foreground">No steps recorded.</div>}
              </ol>
            </section>

            {data.event && (
              <section className="glass-panel rounded-xl p-4">
                <h2 className="font-display text-sm mb-2">Root event candidate</h2>
                <Link to="/events/$id" params={{ id: data.event.id }} className="block rounded border border-border/40 p-3 hover:ring-signal">
                  <div className="font-display text-sm">{data.event.title}</div>
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {data.event.event_class} · severity {data.event.severity} · risk {Math.round(Number(data.event.risk_score) * 100)} · opp {Math.round(Number(data.event.opportunity_score) * 100)}
                  </div>
                </Link>
              </section>
            )}
          </>
        )}
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
