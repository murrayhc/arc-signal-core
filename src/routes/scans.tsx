import { createFileRoute, useRouter } from "@tanstack/react-router";
import { formatDateTimeUK, formatTimeUK } from "@/lib/format-datetime";
import { queryOptions, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getScanHistory, runScan } from "@/lib/archlight/pipeline.functions";
import { Play, Radar } from "lucide-react";
import { toast } from "sonner";

const scanHistoryQuery = queryOptions({
  queryKey: ["archlight", "scans"],
  queryFn: () => getScanHistory(),
  staleTime: 10_000,
});

export const Route = createFileRoute("/scans")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Scan runs and model audit log" },
      { name: "description", content: "Every scan run and every LLM task Arklight has executed, with latency, cost, validation status, and errors." },
      { property: "og:title", content: "Project Arklight · Scans" },
      { property: "og:description", content: "Full auditability: scan runs, model calls, latency, cost, and validation outcomes." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(scanHistoryQuery),
  component: ScansPage,
});

function ScansPage() {
  const { data } = useSuspenseQuery(scanHistoryQuery);
  const router = useRouter();
  const mut = useMutation({
    mutationFn: () => runScan(),
    onSuccess: (r) => { toast.success(`Scan ${r.status}`, { description: `${r.events_created} events · ${r.atomic_claims_created} claims` }); router.invalidate(); },
    onError: (e) => toast.error("Scan failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Pipeline audit</div>
            <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
              <Radar className="h-6 w-6" style={{ color: "var(--color-signal)" }}/> Scans
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every scan run: sources attempted, documents collected, claims extracted, events created. Every model call: model, latency, cost, validation.
            </p>
          </div>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="h-9 px-4 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 ring-signal disabled:opacity-50 flex items-center gap-1.5"
          >
            <Play className="h-3.5 w-3.5"/>{mut.isPending ? "Scanning…" : "Run scan now"}
          </button>
        </div>

        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Scan runs</div>
          <table className="w-full text-xs">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
              <tr><Th>Started</Th><Th>Status</Th><Th>Sources</Th><Th>Docs</Th><Th>Claims</Th><Th>Events</Th><Th>Duration</Th><Th>Notes</Th></tr>
            </thead>
            <tbody>
              {data.runs.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground italic text-xs">No scans yet. Run one.</td></tr>}
              {data.runs.map((r) => {
                const dur = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 100) / 10 : null;
                return (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-accent/20">
                    <Td className="font-mono">{formatDateTimeUK(r.started_at)}</Td>
                    <Td><StatusBadge s={r.status}/></Td>
                    <Td className="font-mono">{r.sources_succeeded}/{r.sources_attempted}{r.sources_failed ? ` (${r.sources_failed} fail)` : ""}</Td>
                    <Td className="font-mono">{r.documents_collected}</Td>
                    <Td className="font-mono">{r.atomic_claims_created}</Td>
                    <Td className="font-mono">{r.events_created}</Td>
                    <Td className="font-mono text-muted-foreground">{dur !== null ? `${dur}s` : "—"}</Td>
                    <Td className="text-muted-foreground max-w-[320px] truncate">{r.notes || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">Recent LLM calls</div>
          <table className="w-full text-xs">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-background/30">
              <tr><Th>When</Th><Th>Task</Th><Th>Model</Th><Th>Status</Th><Th>Latency</Th><Th>Est. cost</Th><Th>Validation</Th><Th>Error</Th></tr>
            </thead>
            <tbody>
              {data.logs.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground italic text-xs">No LLM calls logged.</td></tr>}
              {data.logs.map((l) => (
                <tr key={l.id} className="border-t border-border/40 hover:bg-accent/20">
                  <Td className="font-mono">{formatTimeUK(l.created_at)}</Td>
                  <Td className="font-mono">{l.task_type}</Td>
                  <Td className="font-mono text-muted-foreground">{l.model}</Td>
                  <Td><StatusBadge s={l.status}/></Td>
                  <Td className="font-mono">{l.latency_ms ?? "—"}ms</Td>
                  <Td className="font-mono text-muted-foreground">${Number(l.estimated_cost ?? 0).toFixed(4)}</Td>
                  <Td><Badge>{l.validation_status}</Badge></Td>
                  <Td className="text-[color:var(--color-risk)] max-w-[220px] truncate">{l.error || ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="text-left px-3 py-2">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 uppercase tracking-widest">{children}</span>; }
function StatusBadge({ s }: { s: string }) {
  const c = s === "ok" || s === "completed" ? "var(--color-growth)"
    : s === "completed_with_errors" || s === "degraded" ? "var(--color-opportunity)"
    : s === "running" || s === "queued" ? "var(--color-signal)"
    : "var(--color-risk)";
  return <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-widest" style={{ borderColor: c, color: c }}>{s}</span>;
}
