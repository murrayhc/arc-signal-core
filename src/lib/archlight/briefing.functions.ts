// Daily per-profile morning briefing — what moved overnight, delivered on
// a schedule to any configured delivery channels. Service-role only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callJson, guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
function eventUrl(id: string) { return `${APP_BASE_URL}/events/${id}`; }
function pct(n: number) { return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`; }

interface TopHit {
  item: string;
  kind: string;
  event_id: string;
  event_title: string;
  direction: string;
  relevance: number;
  rationale: string | null;
}

interface BriefingStats {
  new_hits: number;
  top: TopHit[];
  resolved: number;
  best_lead_days: number | null;
}

function neutralSummary(profileName: string, stats: BriefingStats): string {
  const parts = [
    `Overnight, ${stats.new_hits} development${stats.new_hits === 1 ? "" : "s"} moved ${profileName}.`,
  ];
  if (stats.top.length) {
    const t = stats.top[0];
    parts.push(`Top: ${t.item} — ${t.event_title} (${t.direction}, ${pct(t.relevance)}).`);
  }
  if (stats.resolved > 0) {
    parts.push(`${stats.resolved} prior prediction${stats.resolved === 1 ? "" : "s"} resolved${stats.best_lead_days != null ? ` (best lead ${stats.best_lead_days}d)` : ""}.`);
  }
  return parts.join(" ");
}

// ============ GENERATE ============

export interface GenerateOpts { date?: string }  // YYYY-MM-DD; defaults to today UTC
export interface GenerateResult { generated: number; skipped: number; notes: string[] }

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function generateBriefings(opts: GenerateOpts): Promise<GenerateResult> {
  const db = await admin();
  const notes: string[] = [];
  const date = opts.date ?? todayUTC();
  const result: GenerateResult = { generated: 0, skipped: 0, notes };

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles } = await db
    .from("exposure_profiles")
    .select("id, name")
    .eq("active", true);
  const active = profiles ?? [];
  if (active.length === 0) {
    notes.push("No active exposure profiles — no briefings to generate.");
    return result;
  }

  for (const p of active) {
    // Recent hits for this profile
    const { data: hits } = await db
      .from("exposure_hits")
      .select("id, exposure_item_id, event_candidate_id, relevance, direction, rationale, created_at")
      .eq("profile_id", p.id)
      .gte("created_at", sinceIso)
      .order("relevance", { ascending: false })
      .limit(10);
    const hitsArr = hits ?? [];
    if (hitsArr.length === 0) {
      result.skipped++;
      continue;
    }

    const itemIds = Array.from(new Set(hitsArr.map((h) => h.exposure_item_id)));
    const eventIds = Array.from(new Set(hitsArr.map((h) => h.event_candidate_id)));
    const [{ data: items }, { data: events }] = await Promise.all([
      db.from("exposure_items").select("id, name, kind").in("id", itemIds),
      db.from("event_candidates").select("id, title").in("id", eventIds),
    ]);
    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
    const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

    const top: TopHit[] = hitsArr.map((h) => {
      const it = itemMap.get(h.exposure_item_id);
      const ev = eventMap.get(h.event_candidate_id);
      return {
        item: it?.name ?? "(unknown)",
        kind: it?.kind ?? "",
        event_id: h.event_candidate_id,
        event_title: ev?.title ?? "(untitled event)",
        direction: h.direction,
        relevance: Number(h.relevance),
        rationale: h.rationale,
      };
    });

    // Resolved predictions in the window for the profile's exposed events
    let resolvedCount = 0;
    let bestLead: number | null = null;
    if (eventIds.length) {
      const { data: preds } = await db
        .from("outcome_predictions")
        .select("id, lead_time_days, resolved_at")
        .in("event_candidate_id", eventIds)
        .gte("resolved_at", sinceIso);
      for (const r of preds ?? []) {
        resolvedCount++;
        const lt = r.lead_time_days == null ? null : Number(r.lead_time_days);
        if (lt != null && Number.isFinite(lt)) {
          if (bestLead == null || lt > bestLead) bestLead = lt;
        }
      }
    }

    const stats: BriefingStats = {
      new_hits: hitsArr.length,
      top: top.slice(0, 5),
      resolved: resolvedCount,
      best_lead_days: bestLead,
    };

    // AI-composed summary; hedged, factual, GBP only.
    let summary = neutralSummary(p.name, stats);
    try {
      const topLines = top.slice(0, 5).map((t, i) =>
        `${i + 1}. ${t.item} — ${t.event_title} (${t.direction}, ${pct(t.relevance)})${t.rationale ? ` — ${t.rationale}` : ""}`
      ).join("\n");
      const gen = await callJson<{ summary: string }>({
        task: "report_synthesis",
        temperature: 0.15,
        system: "You write a 2-4 sentence morning briefing for an intelligence dashboard. Factual, hedged (may/could/appears/suggests), GBP only for any monetary value. Do NOT give financial advice: no buy/sell/hold, no target price, no allocation, no guaranteed returns. Return JSON {\"summary\":string}. Do not add headings or lists in the summary itself — plain prose only.",
        user: `Profile: ${p.name}\nWindow: last 24h\nNew exposure hits: ${stats.new_hits}\nResolved predictions in window: ${stats.resolved}${bestLead != null ? ` (best lead ${bestLead}d)` : ""}\nTop hits:\n${topLines}\n\nWrite the 2-4 sentence briefing. Lead with the volume ("Overnight, N developments moved your exposures"), then the top item with its direction and relevance %, then one more if useful, then close with resolved predictions if any.`,
      });
      if (gen.ok && gen.data?.summary) {
        const g = guardFinancialAdvice(gen.data.summary);
        summary = g.ok ? gen.data.summary.trim() : neutralSummary(p.name, stats);
      }
    } catch {
      // fall back to neutral summary
    }

    const { error } = await db
      .from("briefings")
      .upsert({
        profile_id: p.id,
        briefing_date: date,
        summary,
        stats: JSON.parse(JSON.stringify(stats)),
        // Clear delivered_at on regenerate so the delivery pass can re-send.
        delivered_at: null,
      }, { onConflict: "profile_id,briefing_date" });
    if (error) {
      notes.push(`Briefing for ${p.name}: upsert failed — ${error.message}`);
      continue;
    }
    result.generated++;
  }
  notes.push(`Briefings: generated ${result.generated}, skipped ${result.skipped} (no new hits) for ${date}.`);
  return result;
}

// ============ DELIVER ============

export interface DeliverOpts { date?: string }
export interface DeliverResult { delivered: number; briefings: number; notes: string[] }

export async function deliverBriefings(opts: DeliverOpts): Promise<DeliverResult> {
  const db = await admin();
  const notes: string[] = [];
  const date = opts.date ?? todayUTC();
  const result: DeliverResult = { delivered: 0, briefings: 0, notes };

  const { data: briefings } = await db
    .from("briefings")
    .select("id, profile_id, summary, stats, briefing_date")
    .eq("briefing_date", date)
    .is("delivered_at", null);
  const arr = briefings ?? [];
  result.briefings = arr.length;
  if (arr.length === 0) return result;

  const profileIds = Array.from(new Set(arr.map((b) => b.profile_id)));

  // Channels scoped to a specific profile
  const { data: scoped } = await db
    .from("delivery_channels")
    .select("id, kind, url, profile_id, active")
    .eq("active", true)
    .in("profile_id", profileIds);
  // "All active profiles" channels (profile_id null)
  const { data: allCh } = await db
    .from("delivery_channels")
    .select("id, kind, url, profile_id, active")
    .eq("active", true)
    .is("profile_id", null);
  const allChannels = [...(scoped ?? []), ...(allCh ?? [])];
  if (allChannels.length === 0) {
    notes.push("Briefing delivery: no active channels — briefings generated but not sent.");
    return result;
  }

  for (const b of arr) {
    const targets = allChannels.filter((c) => c.profile_id === b.profile_id || c.profile_id === null);
    if (targets.length === 0) continue;

    let anyOk = false;
    for (const ch of targets) {
      const body = ch.kind === "slack"
        ? { text: `📊 Morning briefing (${b.briefing_date}): ${b.summary}` }
        : {
            type: "briefing",
            profile_id: b.profile_id,
            briefing_date: b.briefing_date,
            summary: b.summary,
            stats: b.stats,
          };
      try {
        const res = await fetch(ch.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) anyOk = true;
      } catch {
        // best-effort; leave delivered_at null so we can retry later
      }
    }
    if (anyOk) {
      const upd = await db.from("briefings")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", b.id);
      if (!upd.error) result.delivered++;
    }
  }
  notes.push(`Briefing delivery: sent ${result.delivered}/${arr.length} briefing(s) via ${allChannels.length} channel(s).`);
  return result;
}

// ============ COMBINED PASS (called by cron hook) ============

export async function runDailyBriefing(): Promise<{
  date: string;
  generated: number;
  skipped: number;
  delivered: number;
  briefings: number;
  notes: string[];
}> {
  const date = todayUTC();
  const gen = await generateBriefings({ date });
  const del = await deliverBriefings({ date });
  return {
    date,
    generated: gen.generated,
    skipped: gen.skipped,
    delivered: del.delivered,
    briefings: del.briefings,
    notes: [...gen.notes, ...del.notes],
  };
}

// ============ READ (for UI) ============

const ListInput = z.object({
  limit: z.number().int().positive().max(200).optional(),
  profileId: z.string().uuid().optional(),
});
export const listBriefings = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db.from("briefings")
      .select("id, profile_id, briefing_date, summary, stats, delivered_at, created_at")
      .order("briefing_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.profileId) q = q.eq("profile_id", data.profileId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const briefings = rows ?? [];
    const profileIds = Array.from(new Set(briefings.map((b) => b.profile_id)));
    const profiles = profileIds.length
      ? ((await db.from("exposure_profiles").select("id, name, active").in("id", profileIds)).data ?? [])
      : [];
    return { briefings, profiles };
  });

// Manual trigger for the UI ("Run today's briefing now").
export const runDailyBriefingNow = createServerFn({ method: "POST" }).handler(async () => {
  return await runDailyBriefing();
});
