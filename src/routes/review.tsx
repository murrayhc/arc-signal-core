import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatDateTimeUK } from "@/lib/format-datetime";
import { queryOptions, useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getReviewQueue } from "@/lib/archlight/pipeline.functions";
import { applyPredictionVerdict } from "@/lib/archlight/outcome.functions";
import { computeReviewerScores, gradeReviewerVerdictsNow } from "@/lib/archlight/reviewers.functions";
import { ShieldAlert, Award, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const reviewQuery = queryOptions({
  queryKey: ["archlight", "review"],
  queryFn: () => getReviewQueue(),
  staleTime: 15_000,
});

const scoresQuery = queryOptions({
  queryKey: ["archlight", "reviewer-scores"],
  queryFn: () => computeReviewerScores(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Human review queue" },
      { name: "description", content: "Every item the engine flagged for human review: contradictions, weak-single-source claims, guardrail edge cases, and low-confidence syntheses." },
      { property: "og:title", content: "Project Arklight · Review queue" },
      { property: "og:description", content: "Nothing high-stakes ships without review. Contradictions and low-confidence items surface here." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(reviewQuery),
  component: ReviewPage,
});

type Verdict = "happened" | "did_not_happen" | "unresolvable" | "needs_more";

function ReviewPage() {
  const { data } = useSuspenseQuery(reviewQuery);
  const scores = useQuery(scoresQuery);
  const router = useRouter();
  const verdictMut = useMutation({
    mutationFn: (v: { predictionId: string; verdict: Verdict }) =>
      applyPredictionVerdict({ data: { predictionId: v.predictionId, verdict: v.verdict } }),
    onSuccess: (r) => {
      toast.success(`Recorded: ${r.status}${"outcome" in r && r.outcome ? ` · ${r.outcome}` : ""}`);
      router.invalidate();
    },
    onError: (e) => toast.error("Verdict failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const gradeMut = useMutation({
    mutationFn: () => gradeReviewerVerdictsNow(),
    onSuccess: (r) => {
      toast.success(`Graded ${r.graded} verdict(s); ${r.still_open} still open.`);
      scores.refetch();
    },
    onError: (e) => toast.error("Grading failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const scoreList = scores.data?.scores ?? [];
  // Assume the current reviewer is "owner" — attribution field on decisions.
  const currentReviewer = scoreList.find((s) => s.reviewer === "owner") ?? null;
  const weakReviewer = currentReviewer && !currentReviewer.accruing && currentReviewer.accuracy < 0.6;

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

        {/* Reviewer scorecard */}
        <section className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Award className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
            <h2 className="font-display text-sm">Reviewer scorecard</h2>
            <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Brier-scored · surface only, never auto-acts
            </span>
            <button
              onClick={() => gradeMut.mutate()}
              disabled={gradeMut.isPending}
              className="h-7 px-2 rounded-md text-[10px] border border-border/60 hover:bg-accent/40 flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${gradeMut.isPending ? "animate-spin" : ""}`}/> Grade now
            </button>
          </div>
          {scoreList.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No verdicts recorded yet. Record decisions on prediction receipts to start accruing a track record.</div>
          ) : (
            <ul className="space-y-2">
              {scoreList.map((s) => {
                const accColor = s.accruing ? "var(--color-muted-foreground)"
                  : s.accuracy >= 0.75 ? "var(--color-growth)"
                  : s.accuracy >= 0.6 ? "var(--color-signal)"
                  : "var(--color-risk)";
                return (
                  <li key={s.reviewer} className="rounded-lg border border-border/50 bg-background/30 p-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-sm">{s.reviewer}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">graded {s.n_graded} · open {s.n_open}</span>
                      {s.accruing ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest ml-auto" style={{ borderColor: "var(--color-muted-foreground)", color: "var(--color-muted-foreground)" }}>
                          accruing (n={s.n_graded})
                        </span>
                      ) : (
                        <>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest ml-auto" style={{ borderColor: accColor, color: accColor }}>
                            accuracy {(s.accuracy * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            brier {s.mean_brier.toFixed(2)} · weight {s.weight.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="glass-panel rounded-xl overflow-hidden">
          {data.items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground italic">Queue is clear.</div>}
          <ul className="divide-y divide-border/40">
            {data.items.map((it) => (
              <li key={it.id} className="p-4 hover:bg-accent/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{it.item_type}</span>
                      <StatusBadge s={it.status}/>
                      <span className="text-[10px] font-mono text-muted-foreground">{new Date(it.created_at).toLocaleString()}</span>
                      {currentReviewer && !currentReviewer.accruing && it.status === "pending" && (
                        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                          your accuracy · {(currentReviewer.accuracy * 100).toFixed(0)}% (n={currentReviewer.n_graded})
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-2">{it.reason ?? "(no reason recorded)"}</p>
                    {it.reviewer_notes && <p className="text-[11px] mt-1 text-muted-foreground"><span className="text-foreground/80">Notes:</span> {it.reviewer_notes}</p>}
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">item id · {it.item_id}</div>

                    {weakReviewer && it.status === "pending" && (
                      <div className="mt-2 text-[11px] font-mono uppercase tracking-widest px-2 py-1 rounded inline-flex items-center gap-1.5"
                           style={{ border: "1px solid color-mix(in oklch, var(--color-reason) 55%, transparent)", color: "var(--color-reason)", background: "color-mix(in oklch, var(--color-reason) 10%, transparent)" }}>
                        <ShieldAlert className="h-3 w-3"/> second opinion suggested
                      </div>
                    )}

                    {it.item_type === "prediction_resolution" && it.status === "pending" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <VerdictBtn label="Happened" color="var(--color-growth)" disabled={verdictMut.isPending} onClick={() => verdictMut.mutate({ predictionId: it.item_id, verdict: "happened" })}/>
                        <VerdictBtn label="Didn't happen" color="var(--color-risk)" disabled={verdictMut.isPending} onClick={() => verdictMut.mutate({ predictionId: it.item_id, verdict: "did_not_happen" })}/>
                        <VerdictBtn label="Unresolvable" color="var(--color-muted-foreground)" disabled={verdictMut.isPending} onClick={() => verdictMut.mutate({ predictionId: it.item_id, verdict: "unresolvable" })}/>
                        <VerdictBtn label="Needs more" color="var(--color-signal)" disabled={verdictMut.isPending} onClick={() => verdictMut.mutate({ predictionId: it.item_id, verdict: "needs_more" })}/>
                      </div>
                    )}
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

function VerdictBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 rounded-md text-[11px] font-mono uppercase tracking-widest border transition disabled:opacity-50"
      style={{ borderColor: color, color }}
    >
      {label}
    </button>
  );
}

function StatusBadge({ s }: { s: string }) {
  const c = s === "approved" ? "var(--color-growth)"
    : s === "rejected" ? "var(--color-risk)"
    : s === "needs_more_evidence" ? "var(--color-opportunity)"
    : "var(--color-signal)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{s}</span>;
}
