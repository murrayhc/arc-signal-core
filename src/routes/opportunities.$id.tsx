import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getOpportunityDetail } from "@/lib/archlight/pipeline.functions";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { ForensicReport } from "@/components/archlight/ForensicReport";

export const Route = createFileRoute("/opportunities/$id")({
  head: () => ({
    meta: [
      { title: "Archlight · Opportunity detail" },
      { name: "description", content: "Full opportunity card with buyer pain, likely buyers, suggested offer, evidence and hedged positioning." },
      { property: "og:title", content: "Archlight · Opportunity detail" },
      { property: "og:description", content: "Traceable opportunity card grounded in public signals." },
    ],
  }),
  component: OpportunityDetailPage,
});

function OpportunityDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["archlight", "opportunity", id],
    queryFn: () => getOpportunityDetail({ data: { id } }),
  });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-3.5 w-3.5"/>Back
        </button>
        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}
        {data && !data.opportunity && <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Opportunity not found.</div>}
        {data?.opportunity && (
          <>
            <header className="glass-panel rounded-xl p-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Sparkles className="h-3 w-3"/> opportunity card</div>
              <h1 className="font-display text-2xl mt-1">{data.opportunity.title}</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl">{data.opportunity.summary}</p>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <Metric k="Value" v={String(Math.round(Number(data.opportunity.commercial_value_score) * 100))} c="var(--color-opportunity)"/>
                <Metric k="Urgency" v={String(Math.round(Number(data.opportunity.urgency_score) * 100))}/>
                <Metric k="Actionability" v={String(Math.round(Number(data.opportunity.actionability_score) * 100))}/>
                <Metric k="Evidence" v={String(Math.round(Number(data.opportunity.evidence_score) * 100))}/>
                <Metric k="Confidence" v={String(Math.round(Number(data.opportunity.confidence) * 100))} c="var(--color-signal)"/>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="px-2 py-1 rounded border border-border/60">type · {data.opportunity.opportunity_type}</span>
                {(data.opportunity.affected_sectors ?? []).slice(0, 3).map((s: string) => <span key={s} className="px-2 py-1 rounded border border-border/60">sector · {s}</span>)}
                {(data.opportunity.affected_regions ?? []).slice(0, 3).map((s: string) => <span key={s} className="px-2 py-1 rounded border border-border/60">region · {s}</span>)}
              </div>
            </header>

            <section className="glass-panel rounded-xl p-4 grid md:grid-cols-2 gap-3">
              <Block label="Buyer pain" text={data.opportunity.buyer_pain}/>
              <Block label="Suggested offer" text={data.opportunity.suggested_offer}/>
              <Block label="Opportunity logic" text={data.opportunity.opportunity_logic}/>
              <Block label="Risk logic" text={data.opportunity.risk_logic}/>
              <Block label="Next best action" text={data.opportunity.next_best_action}/>
              {(data.opportunity.likely_buyers ?? []).length > 0 && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Likely buyers</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(data.opportunity.likely_buyers as string[]).map((b) => <span key={b} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50">◇ {b}</span>)}
                  </div>
                </div>
              )}
            </section>

            <ForensicReport subjectType="opportunity" subjectId={data.opportunity.id} title={data.opportunity.title} />


            {data.event && (
              <section className="glass-panel rounded-xl p-4">
                <h2 className="font-display text-sm mb-2">Underlying event</h2>
                <Link to="/events/$id" params={{ id: data.event.id }} className="block rounded border border-border/40 p-3 hover:ring-signal">
                  <div className="font-display text-sm">{data.event.title}</div>
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {data.event.event_class} · severity {data.event.severity} · risk {Math.round(Number(data.event.risk_score) * 100)} · opp {Math.round(Number(data.event.opportunity_score) * 100)} · conf {Math.round(Number(data.event.confidence) * 100)}
                  </div>
                </Link>
              </section>
            )}

            {data.positioning.length > 0 && (
              <section className="glass-panel rounded-xl p-4">
                <h2 className="font-display text-sm mb-2">Strategic positioning examples</h2>
                <ul className="grid md:grid-cols-2 gap-3">
                  {data.positioning.map((p) => (
                    <li key={p.id} className="rounded border border-border/40 bg-background/30 p-3">
                      <div className="font-display text-sm">{p.title}</div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{p.user_type} · conf {Math.round(Number(p.confidence) * 100)}</div>
                      <p className="text-xs mt-2">{p.how_it_could_be_used}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Not financial advice · public signals only · no buy · no sell · no target price</div>
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
function Block({ label, text }: { label: string; text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm mt-1">{text}</div>
    </div>
  );
}
