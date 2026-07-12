import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getInterrogations } from "@/lib/archlight/pipeline.functions";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/interrogations")({
  head: () => ({
    meta: [
      { title: "Archlight · Past interrogations" },
      { name: "description", content: "Every interrogation run against Archlight, with the synthesised present-context brief and the evidence IDs it was grounded in." },
      { property: "og:title", content: "Archlight · Interrogations" },
      { property: "og:description", content: "History of intelligence queries against Archlight." },
    ],
  }),
  component: InterrogationsPage,
});

type Brief = {
  what_is_happening_now?: string;
  subject_profile?: string;
  what_to_watch?: string[];
  caveats?: string[];
  confidence_overall?: number;
} | null;

function ResearchTabs({ active }: { active: "research" | "history" }) {
  const base = "px-3 py-1.5 text-xs rounded-md border border-border/60 transition-colors";
  const on = "bg-accent/60 text-foreground";
  const off = "text-muted-foreground hover:bg-accent/30";
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border/50 bg-background/40">
      <Link to="/interrogate" className={`${base} ${active === "research" ? on : off}`}>Research</Link>
      <Link to="/interrogations" className={`${base} ${active === "history" ? on : off}`}>History</Link>
    </div>
  );
}

function InterrogationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["archlight", "interrogations"], queryFn: () => getInterrogations() });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <header>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2"><Search className="h-3 w-3"/> interrogation history</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">Past interrogations</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Every query, its stored brief, evidence IDs, and the model that answered it.</p>
        </header>

        <ResearchTabs active="history"/>

        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}

        {data && (
          <ul className="space-y-3">
            {data.queries.map((q) => {
              const brief = (q.brief_synth ?? null) as Brief;
              const snippet = brief?.what_is_happening_now?.trim() || brief?.subject_profile?.trim() || "";
              const watch = brief?.what_to_watch ?? [];
              return (
                <li key={q.id} className="glass-panel rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-sm">“{q.query_text}”</div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {new Date(q.created_at).toISOString().slice(0, 16).replace("T", " ")} · {q.query_class} · {q.status} · {q.result_count} matches · evidence {(q.evidence_ids ?? []).length}
                      </div>
                    </div>
                    <Link to="/interrogate" search={{ q: q.query_text }} className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1">re-run</Link>
                  </div>
                  {snippet && <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{snippet}</p>}
                  {watch.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {watch.slice(0, 4).map((s: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border/50">◇ {s}</span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            {!data.queries.length && <li className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground italic">No interrogations yet.</li>}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
