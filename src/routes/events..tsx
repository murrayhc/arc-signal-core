
function PredictionStatusBadge({ status, outcome }: { status: string; outcome: string | null }) {
  const label = status === "resolved" && outcome ? outcome : status;
  const c = outcome === "happened" ? "var(--color-growth)"
    : outcome === "did_not_happen" ? "var(--color-risk)"
    : outcome === "unresolvable" ? "var(--color-muted-foreground)"
    : status === "pending_review" ? "var(--color-reason)"
    : "var(--color-signal)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{label}</span>;
}
