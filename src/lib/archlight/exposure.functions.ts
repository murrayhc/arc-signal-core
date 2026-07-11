// Exposure model — profiles of what a user actually holds/cares about,
// with every synthesized event scored against them ("why this matters to you").
//
// Public read via server fns; writes via service-role admin client. All
// generated rationale text is passed through guardFinancialAdvice — on a
// guard violation we fall back to a neutral, factual sentence.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof admin>>;

const KIND_VALUES = [
  "company", "supplier", "customer", "competitor",
  "sector", "region", "commodity", "keyword",
] as const;
type ExposureKind = (typeof KIND_VALUES)[number];

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function neutralRationale(itemName: string, evTitle: string, path: string): string {
  return `${itemName} may be affected by "${evTitle}" (${path}).`;
}

function safeRationale(itemName: string, evTitle: string, path: string): string {
  const draft = `${itemName} appears potentially affected by "${evTitle}" via ${path}.`;
  const guard = guardFinancialAdvice(draft);
  return guard.ok ? draft : neutralRationale(itemName, evTitle, path);
}

// ============ SCORING (called from runScan) ============

export interface ScoreExposuresOpts {
  scanRunId?: string;
  /** If provided, only score these event ids. Otherwise use events created this scan_run_id. */
  eventIds?: string[];
}
export interface ScoreExposuresResult {
  events_scored: number;
  hits_created: number;
  hits_updated: number;
  notes: string[];
}

export async function scoreExposures(opts: ScoreExposuresOpts): Promise<ScoreExposuresResult> {
  const db = await admin();
  const notes: string[] = [];
  const result: ScoreExposuresResult = { events_scored: 0, hits_created: 0, hits_updated: 0, notes };

  // 1. Active profiles + items
  const { data: profiles } = await db.from("exposure_profiles").select("id").eq("active", true);
  const profileIds = (profiles ?? []).map((p) => p.id);
  if (profileIds.length === 0) {
    notes.push("Exposure: no active profiles.");
    return result;
  }
  const { data: items } = await db
    .from("exposure_items")
    .select("id, profile_id, kind, name, entity_id, weight")
    .in("profile_id", profileIds);
  const allItems = (items ?? []) as Array<{
    id: string; profile_id: string; kind: ExposureKind; name: string;
    entity_id: string | null; weight: number;
  }>;
  if (allItems.length === 0) {
    notes.push("Exposure: no exposure_items across active profiles.");
    return result;
  }

  // 2. Events to score
  let evQ = db.from("event_candidates").select("id, title, summary, event_class, confidence, affected_sector, affected_region, primary_entity_id");
  if (opts.eventIds?.length) {
    evQ = evQ.in("id", opts.eventIds);
  } else if (opts.scanRunId) {
    evQ = evQ.eq("created_from_scan_run_id", opts.scanRunId);
  } else {
    evQ = evQ.order("last_updated_at", { ascending: false }).limit(50);
  }
  const { data: events } = await evQ;
  const evList = (events ?? []) as Array<{
    id: string; title: string; summary: string | null; event_class: string;
    confidence: number; affected_sector: string | null; affected_region: string | null;
    primary_entity_id: string | null;
  }>;
  if (evList.length === 0) {
    notes.push("Exposure: no events to score.");
    return result;
  }
  result.events_scored = evList.length;

  // 3. Precompute per-event context:
  //    - company_impacts.company_name (lowercased)
  //    - linked entity ids (primary + those from company_impacts.entity_id)
  //    - one-hop entity relationships (either direction) from those linked ids
  const eventIds = evList.map((e) => e.id);
  const { data: impacts } = await db
    .from("company_impacts")
    .select("event_candidate_id, company_name, entity_id")
    .in("event_candidate_id", eventIds);
  const impactsByEvent = new Map<string, Array<{ company: string; entity_id: string | null }>>();
  for (const im of impacts ?? []) {
    const arr = impactsByEvent.get(im.event_candidate_id) ?? [];
    arr.push({ company: im.company_name ?? "", entity_id: im.entity_id });
    impactsByEvent.set(im.event_candidate_id, arr);
  }

  const eventEntityIds = new Map<string, Set<string>>();
  for (const e of evList) {
    const s = new Set<string>();
    if (e.primary_entity_id) s.add(e.primary_entity_id);
    for (const im of impactsByEvent.get(e.id) ?? []) {
      if (im.entity_id) s.add(im.entity_id);
    }
    eventEntityIds.set(e.id, s);
  }

  // Load canonical_names for all linked entities (for name matching when the
  // impact rows don't spell them out).
  const allLinkedEntityIds = Array.from(new Set(evList.flatMap((e) => Array.from(eventEntityIds.get(e.id) ?? []))));
  const entityNames = new Map<string, string>();
  if (allLinkedEntityIds.length) {
    const { data: ents } = await db
      .from("entities")
      .select("id, canonical_name")
      .in("id", allLinkedEntityIds);
    for (const e of ents ?? []) entityNames.set(e.id, e.canonical_name);
  }

  // One-hop relationships for candidate item.entity_id values → target entity ids.
  const itemEntityIds = Array.from(new Set(allItems.map((i) => i.entity_id).filter((v): v is string => !!v)));
  const relMap = new Map<string, Array<{ other: string; weight: number }>>(); // item_entity_id -> hops
  if (itemEntityIds.length) {
    const { data: rels } = await db
      .from("entity_relationships")
      .select("from_entity_id, to_entity_id, weight")
      .or(itemEntityIds.map((id) => `from_entity_id.eq.${id},to_entity_id.eq.${id}`).join(","));
    for (const r of rels ?? []) {
      const w = Number(r.weight ?? 1);
      if (itemEntityIds.includes(r.from_entity_id)) {
        const arr = relMap.get(r.from_entity_id) ?? [];
        arr.push({ other: r.to_entity_id, weight: w });
        relMap.set(r.from_entity_id, arr);
      }
      if (itemEntityIds.includes(r.to_entity_id)) {
        const arr = relMap.get(r.to_entity_id) ?? [];
        arr.push({ other: r.from_entity_id, weight: w });
        relMap.set(r.to_entity_id, arr);
      }
    }
  }

  // 4. Score each item × event
  for (const ev of evList) {
    const evNames = new Set<string>();
    for (const im of impactsByEvent.get(ev.id) ?? []) evNames.add(norm(im.company));
    for (const eid of eventEntityIds.get(ev.id) ?? []) {
      const n = entityNames.get(eid);
      if (n) evNames.add(norm(n));
    }
    const evEntitySet = eventEntityIds.get(ev.id) ?? new Set<string>();
    const evSector = norm(ev.affected_sector);
    const evRegion = norm(ev.affected_region);
    const evConf = clamp01(ev.confidence);
    const hay = `${ev.title} ${ev.summary ?? ""}`.toLowerCase();
    const direction =
      ev.event_class === "risk" ? "risk"
      : ev.event_class === "opportunity" ? "opportunity"
      : "mixed";

    for (const item of allItems) {
      let base = 0;
      let matchKind = "";
      let path = "";
      const itemNameLc = norm(item.name);

      if (["company", "supplier", "customer", "competitor"].includes(item.kind)) {
        // Direct name match against company_impacts / linked entity names.
        const direct = itemNameLc && (evNames.has(itemNameLc)
          || Array.from(evNames).some((n) => n.includes(itemNameLc) || itemNameLc.includes(n)));
        if (direct) {
          base = 0.9;
          matchKind = `direct_${item.kind}`;
          path = "direct name match on event impacts";
        } else if (item.entity_id) {
          // One hop via entity_relationships to any event-linked entity.
          const hops = relMap.get(item.entity_id) ?? [];
          const hit = hops.find((h) => evEntitySet.has(h.other));
          if (hit) {
            base = 0.65 * clamp01(hit.weight);
            matchKind = `relationship_${item.kind}`;
            path = "one-hop entity relationship";
          }
        }
      } else if (item.kind === "sector") {
        if (itemNameLc && evSector && (evSector === itemNameLc || evSector.includes(itemNameLc) || itemNameLc.includes(evSector))) {
          base = 0.5;
          matchKind = "sector";
          path = `sector "${ev.affected_sector}"`;
        }
      } else if (item.kind === "region") {
        if (itemNameLc && evRegion && (evRegion === itemNameLc || evRegion.includes(itemNameLc) || itemNameLc.includes(evRegion))) {
          base = 0.35;
          matchKind = "region";
          path = `region "${ev.affected_region}"`;
        }
      } else if (item.kind === "commodity" || item.kind === "keyword") {
        if (itemNameLc && hay.includes(itemNameLc)) {
          base = 0.45;
          matchKind = item.kind;
          path = `${item.kind} "${item.name}" in title/summary`;
        }
      }

      if (base <= 0) continue;
      const relevance = Math.max(0, Math.min(1, base * Number(item.weight ?? 1) * (0.5 + 0.5 * evConf)));
      if (relevance < 0.25) continue;

      const rationale = safeRationale(item.name, ev.title, path);

      // Upsert — keep the HIGHER relevance; refresh rationale/match_kind only when it improves.
      const { data: existing } = await db
        .from("exposure_hits")
        .select("id, relevance")
        .eq("exposure_item_id", item.id)
        .eq("event_candidate_id", ev.id)
        .maybeSingle();

      if (!existing) {
        const ins = await db.from("exposure_hits").insert({
          profile_id: item.profile_id,
          exposure_item_id: item.id,
          event_candidate_id: ev.id,
          relevance,
          direction,
          match_kind: matchKind,
          rationale,
          seen: false,
        });
        if (!ins.error) result.hits_created++;
      } else if (relevance > Number(existing.relevance ?? 0)) {
        const upd = await db.from("exposure_hits")
          .update({ relevance, direction, match_kind: matchKind, rationale })
          .eq("id", existing.id);
        if (!upd.error) result.hits_updated++;
      }
    }
  }

  notes.push(`Exposure: scored ${result.events_scored} event(s), ${result.hits_created} new hit(s), ${result.hits_updated} improved.`);
  return result;
}

// ============ SERVER FNS FOR UI ============

const ProfileInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export const createExposureProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ProfileInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db.from("exposure_profiles").insert({
      name: data.name.trim(),
      description: data.description ?? null,
      active: data.active ?? true,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

const ItemInput = z.object({
  profile_id: z.string().uuid(),
  kind: z.enum(KIND_VALUES),
  name: z.string().min(1).max(240),
  weight: z.number().min(0).max(100).optional(),
  value_gbp: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const addExposureItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ItemInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    // Best-effort entity resolution for name-based kinds.
    let entityId: string | null = null;
    if (["company", "supplier", "customer", "competitor"].includes(data.kind)) {
      const nameLc = data.name.trim();
      const { data: ent } = await db
        .from("entities")
        .select("id")
        .ilike("canonical_name", nameLc)
        .limit(1)
        .maybeSingle();
      entityId = ent?.id ?? null;
    }
    const { data: row, error } = await db.from("exposure_items").insert({
      profile_id: data.profile_id,
      kind: data.kind,
      name: data.name.trim(),
      entity_id: entityId,
      weight: data.weight ?? 1,
      value_gbp: data.value_gbp ?? null,
      notes: data.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeExposureItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("exposure_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProfilesWithItems = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const [{ data: profiles }, { data: items }] = await Promise.all([
    db.from("exposure_profiles").select("*").order("created_at", { ascending: false }),
    db.from("exposure_items").select("*"),
  ]);
  const grouped = (profiles ?? []).map((p) => ({
    ...p,
    items: (items ?? []).filter((it) => it.profile_id === p.id),
  }));
  return { profiles: grouped };
});

const ListHitsInput = z.object({
  profileId: z.string().uuid().optional(),
  unseenOnly: z.boolean().optional(),
  limit: z.number().int().positive().max(200).optional(),
});
export const listExposureHits = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ListHitsInput.parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db.from("exposure_hits").select(
      "id, profile_id, exposure_item_id, event_candidate_id, relevance, direction, match_kind, rationale, seen, created_at",
    );
    if (data.profileId) q = q.eq("profile_id", data.profileId);
    if (data.unseenOnly) q = q.eq("seen", false);
    q = q.order("relevance", { ascending: false }).limit(data.limit ?? 100);
    const { data: hits, error } = await q;
    if (error) throw new Error(error.message);
    const hitsArr = hits ?? [];
    const eventIds = Array.from(new Set(hitsArr.map((h) => h.event_candidate_id)));
    const itemIds = Array.from(new Set(hitsArr.map((h) => h.exposure_item_id)));
    const [{ data: events }, { data: items }] = await Promise.all([
      eventIds.length
        ? db.from("event_candidates").select("id, title, event_class, severity, risk_score, opportunity_score, confidence").in("id", eventIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      itemIds.length
        ? db.from("exposure_items").select("id, name, kind, weight").in("id", itemIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    ]);
    return { hits: hitsArr, events: events ?? [], items: items ?? [] };
  });

export const markHitSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("exposure_hits").update({ seen: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
