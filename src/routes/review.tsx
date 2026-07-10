import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getReviewQueue } from "@/lib/archlight/pipeline.functions";
import { ShieldAlert } from "lucide-react";

const reviewQuery = queryOptions({
  queryKey: ["archlight", "review"],
  queryFn: () => getReviewQueue(),
  staleTime: 15_000,
});

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Archlight · Human review queue" },
      { name: "description", content: "Every item the engine flagged for human review: contradictions, weak-single-source claims, guardrail edge cases, and low-confidence syntheses." },
      { property: "og:title", content: "Archlight · Review queue" },
      { property: "og:description", content: "Nothing high-stakes ships without review. Contradictions and low-confidence items surface here." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewQuery),
  component: ReviewPage,
});

function ReviewPage() {
  const { data } = useSuspenseQuery(reviewQuery);
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Human review</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
            <ShieldAlert className="h-6 w-6" style={{ color: "var(--color-reason)" }}/> Review queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Contradictions, weak-single-source claims, guardrail edge cases, and low-confidence syntheses land here. Nothing high-stakes ships without review.
          </p>
        </div>

        <div className="glass-panel rounded-xl overflow-hidden">
          {data.items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground italic">Queue is clear.</div>}
          <ul className="divide-y divide-border/40">
            {data.items.map((it) => (
              <li key={it.id} className="p-4 hover:bg-accent/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{it.item_type}</span>
                      <StatusBadge s={it.status}/>
                      <span className="text-[10px] font-mono text-muted-foreground">{new Date(it.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm mt-2">{it.reason ?? "(no reason recorded)"}</p>
                    {it.reviewer_notes && <p className="text-[11px] mt-1 text-muted-foreground"><span className="text-foreground/80">Notes:</span> {it.reviewer_notes}</p>}
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">item id · {it.item_id}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ s }: { s: string }) {
  const c = s === "approved" ? "var(--color-growth)"
    : s === "rejected" ? "var(--color-risk)"
    : s === "needs_more_evidence" ? "var(--color-opportunity)"
    : "var(--color-signal)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{s}</span>;
}
