import { createFileRoute } from "@tanstack/react-router";
import { runScanImpl } from "@/lib/archlight/pipeline.functions";

// Public scan hook called by pg_cron every 6 hours.
// /api/public/* bypasses auth on published sites — we still gate on the
// project's anon key so random callers can't trigger a scan.
export const Route = createFileRoute("/api/public/hooks/scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runScanImpl();
          return new Response(JSON.stringify({ ok: true, result }), { headers: { "Content-Type": "application/json" } });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      GET: async () => new Response("Arklight scan hook — POST with apikey header only.", { headers: { "Content-Type": "text/plain" } }),
    },
  },
});
