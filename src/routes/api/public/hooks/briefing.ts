import { createFileRoute } from "@tanstack/react-router";
import { runDailyBriefing } from "@/lib/archlight/briefing.functions";

// Cron-triggered daily briefing hook. Called by pg_cron once daily at 06:30 UTC.
// /api/public/* bypasses auth on published sites — we still gate on the anon key.
export const Route = createFileRoute("/api/public/hooks/briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runDailyBriefing();
          return new Response(JSON.stringify({ ok: true, result }), { headers: { "Content-Type": "application/json" } });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      GET: async () => new Response("Archlight briefing hook — POST with apikey header only.", { headers: { "Content-Type": "text/plain" } }),
    },
  },
});
