import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getOpportunities } from "@/lib/archlight/pipeline.functions";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/opportunities/")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Opportunities from public signals" },
      { name: "description", content: "Traceable opportunity cards Arklight has synthesised from public event candidates: buyer pain, likely buyers, suggested offer, urgency and commercial value." },
      { property: "og:title", content: "Project Arklight · Opportunities" },
      { property: "og:description", content: "Hedged commercial angles grounded in public signals." },
    ],
  }),
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  const { data, isLoading } = useQuery({ queryKey: ["archlight", "opportunities"], queryFn: () => getOpportunities() });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <header>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2"><Sparkles className="h-3 w-3"/> Opportunities</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">Opportunities from public signals</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Hedged commercial angles synthesised from event clusters. Not financial advice — every card carries evidence and confidence.</p>
        </header>

        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}

        {data && (
          <ul className="grid md:grid-cols-2 gap-3">
            {data.opportunities.map((o) => (
              <li key={o.id} className="glass-panel rounded-xl p-4 hover:ring-signal transition">
                <Link to="/opportunities/$id" params={{ id: o.id }} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-sm">{o.title}</div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0" style={{ borderColor: "var(--color-opportunity)", color: "var(--color-opportunity)" }}>val {Math.round(Number(o.commercial_value_score) * 100)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{o.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <span>type · {o.opportunity_type}</span>
                    <span>urgency {Math.round(Number(o.urgency_score) * 100)}</span>
                    <span>conf {Math.round(Number(o.confidence) * 100)}</span>
                    {(o.affected_sectors ?? []).slice(0, 2).map((s: string) => <span key={s}>{s}</span>)}
                  </div>
                </Link>
              </li>
            ))}
            {!data.opportunities.length && (
              <li className="col-span-2 glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground italic">No opportunities yet. Run a scan.</li>
            )}
          </ul>
        )}
      </div>
    </AppShell>
  );
}