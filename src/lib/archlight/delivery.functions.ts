// Delivery channels — push exposure hits to Slack / generic webhooks.
// Service-role only. The `delivery_channels` table has RLS enabled with NO
// public policy: URLs are credential-like and must never be readable client-side.
// All reads/writes go through these server functions, and channel URLs are
// never returned to the client.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isProUser } from "./billing.functions";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const KIND = z.enum(["slack", "webhook"]);

// SSRF guard: block loopback, link-local, RFC1918 private, cloud-metadata, and
// non-public hostnames. Only http(s) URLs to public hosts are allowed.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}
function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd")) return true;
  if (s.startsWith("::ffff:")) return isPrivateIPv4(s.slice(7));
  return false;
}
function assertPublicHttpUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("URL must be http(s)"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("URL must be http(s)");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new Error("URL must include a host");
  // Block obvious private/reserved hostnames
  const blockedNames = new Set(["localhost", "ip6-localhost", "ip6-loopback", "broadcasthost", "metadata.google.internal", "metadata"]);
  if (blockedNames.has(host)) throw new Error("URL host is not publicly routable");
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("URL host is not publicly routable");
  }
  // IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error("URL host is not publicly routable");
  }
  // IPv6 literal
  if (host.includes(":")) {
    if (isPrivateIPv6(host)) throw new Error("URL host is not publicly routable");
  }
  return u.toString();
}
const HttpUrl = z.string().url().transform((u, ctx) => {
  try { return assertPublicHttpUrl(u); }
  catch (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err instanceof Error ? err.message : "invalid URL" });
    return z.NEVER;
  }
});

type ChannelRow = {
  id: string;
  user_id: string;
  kind: "slack" | "webhook";
  url: string;
  label: string | null;
  profile_id: string | null;
  min_relevance: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type PublicChannel = {
  id: string;
  kind: "slack" | "webhook";
  label: string | null;
  profile_id: string | null;
  min_relevance: number;
  active: boolean;
  url_host: string;
  created_at: string;
};

function toPublic(row: ChannelRow): PublicChannel {
  let host = "";
  try { host = new URL(row.url).host; } catch { host = ""; }
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    profile_id: row.profile_id,
    min_relevance: Number(row.min_relevance),
    active: row.active,
    url_host: host,
    created_at: row.created_at,
  };
}

// ============ CRUD (URLs never returned to client) ============

export const listDeliveryChannels = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data, error } = await db
      .from("delivery_channels")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ChannelRow[];
    const profileIds = Array.from(new Set(rows.map((r) => r.profile_id).filter((v): v is string => !!v)));
    const profiles = profileIds.length
      ? ((await db.from("exposure_profiles").select("id, name").eq("user_id", context.userId).in("id", profileIds)).data ?? [])
      : [];
    return { channels: rows.map(toPublic), profiles };
  });

const AddInput = z.object({
  kind: KIND,
  url: HttpUrl,
  label: z.string().max(120).optional().nullable(),
  profileId: z.string().uuid().optional().nullable(),
  minRelevance: z.number().min(0).max(1).optional(),
});
export const addDeliveryChannel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row, error } = await db.from("delivery_channels").insert({
      user_id: context.userId,
      kind: data.kind,
      url: data.url,
      label: data.label ?? null,
      profile_id: data.profileId ?? null,
      min_relevance: data.minRelevance ?? 0.6,
      active: true,
    }).select().single();
    if (error) throw new Error(error.message);
    return toPublic(row as ChannelRow);
  });

export const removeDeliveryChannel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { error } = await db.from("delivery_channels").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: row, error } = await db
      .from("delivery_channels")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Channel not found");
    const ch = row as ChannelRow;
    const body = ch.kind === "slack"
      ? { text: "Archlight delivery test — this channel is wired up and receiving exposure hits." }
      : { type: "delivery_test", message: "Archlight delivery test", at: new Date().toISOString() };
    try {
      const safeUrl = assertPublicHttpUrl(ch.url);
      const res = await fetch(safeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
    }
  });


// ============ DELIVERY PASS (called from runScan) ============

export interface DeliverOpts { scanRunId?: string }
export interface DeliverResult {
  delivered: number;
  channels: number;
  notes: string[];
}

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");

function eventUrl(eventId: string): string {
  const base = APP_BASE_URL || "";
  return `${base}/events/${eventId}`;
}

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

export async function deliverExposureHits(_opts: DeliverOpts): Promise<DeliverResult> {
  const db = await admin();
  const notes: string[] = [];
  const result: DeliverResult = { delivered: 0, channels: 0, notes };

  const { data: chans } = await db
    .from("delivery_channels")
    .select("*")
    .eq("active", true);
  const channels = (chans ?? []) as ChannelRow[];
  if (channels.length === 0) return result;
  result.channels = channels.length;

  // Cache active profile ids per owner (for channels targeting "all this user's profiles").
  const ownerIds = Array.from(new Set(channels.map((c) => c.user_id)));
  const activeProfilesByOwner = new Map<string, string[]>();
  if (ownerIds.length) {
    const { data: activeProfiles } = await db
      .from("exposure_profiles")
      .select("id, user_id")
      .eq("active", true)
      .in("user_id", ownerIds);
    for (const p of activeProfiles ?? []) {
      const arr = activeProfilesByOwner.get(p.user_id) ?? [];
      arr.push(p.id);
      activeProfilesByOwner.set(p.user_id, arr);
    }
  }

  for (const ch of channels) {
    // Undelivered hits for this channel's owner, above threshold.
    let q = db
      .from("exposure_hits")
      .select("id, profile_id, exposure_item_id, event_candidate_id, relevance, direction, rationale")
      .eq("user_id", ch.user_id)
      .is("delivered_at", null)
      .gte("relevance", Number(ch.min_relevance))
      .order("relevance", { ascending: false })
      .limit(20);
    if (ch.profile_id) {
      q = q.eq("profile_id", ch.profile_id);
    } else {
      const ids = activeProfilesByOwner.get(ch.user_id) ?? [];
      if (ids.length === 0) continue;
      q = q.in("profile_id", ids);
    }

    const { data: hits } = await q;
    const hitArr = hits ?? [];
    if (hitArr.length === 0) continue;

    const itemIds = Array.from(new Set(hitArr.map((h) => h.exposure_item_id)));
    const eventIds = Array.from(new Set(hitArr.map((h) => h.event_candidate_id)));
    const [{ data: items }, { data: events }] = await Promise.all([
      db.from("exposure_items").select("id, name, kind").in("id", itemIds),
      db.from("event_candidates").select("id, title").in("id", eventIds),
    ]);
    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
    const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

    for (const h of hitArr) {
      const item = itemMap.get(h.exposure_item_id);
      const ev = eventMap.get(h.event_candidate_id);
      if (!item || !ev) continue;
      const url = eventUrl(ev.id);
      const relevance = Number(h.relevance);
      const body = ch.kind === "slack"
        ? {
            text: `${item.name} — ${ev.title} (${h.direction}, ${pct(relevance)}). ${h.rationale ?? ""}  ${url}`.trim(),
          }
        : {
            type: "exposure_hit",
            profile_id: h.profile_id,
            item_name: item.name,
            kind: item.kind,
            event_id: ev.id,
            event_title: ev.title,
            direction: h.direction,
            relevance,
            rationale: h.rationale,
            url,
          };
      try {
        const safeUrl = assertPublicHttpUrl(ch.url);
        const res = await fetch(safeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          redirect: "error",
        });
        if (res.ok) {
          const upd = await db.from("exposure_hits")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", h.id);
          if (!upd.error) result.delivered++;
        }
      } catch {
        // Leave delivered_at null; retry next scan.
      }
    }
  }

  if (result.delivered > 0) {
    notes.push(`Delivery: sent ${result.delivered} exposure hit(s) across ${result.channels} channel(s).`);
  }
  return result;
}
