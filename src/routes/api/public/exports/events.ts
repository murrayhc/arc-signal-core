import { createFileRoute } from "@tanstack/react-router";

// Public CSV export of event candidates. Anyone can hit it — public intelligence.
export const Route = createFileRoute("/api/public/exports/events")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("event_candidates")
          .select("id, title, event_class, event_type, status, severity, affected_sector, affected_region, risk_score, opportunity_score, confidence, probability, evidence_count, source_diversity_score, last_updated_at")
          .order("last_updated_at", { ascending: false })
          .limit(2000);

        const cols = ["id","title","event_class","event_type","status","severity","affected_sector","affected_region","risk_score","opportunity_score","confidence","probability","evidence_count","source_diversity_score","last_updated_at"];
        const rows = [cols.join(",")];
        for (const r of data ?? []) {
          rows.push(cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","));
        }
        return new Response(rows.join("\n"), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="archlight-events-${new Date().toISOString().slice(0,10)}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
