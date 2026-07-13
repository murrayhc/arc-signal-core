// Convergence detection: find recent events covered by multiple genuinely
// independent outlets, annotated with each outlet's political lean from the
// source_lean table. Read-only, no writes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deriveIndependenceGroup } from "./text.server";
import { callJson, guardFinancialAdvice, pickModel } from "./ai-gateway.server";
import { requireOwner } from "./owner-auth.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const inputSchema = z.object({
  minOutlets: z.number().int().min(1).max(20).optional(),
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type ConvergenceOutlet = {
  domain: string;
  outlet_name: string | null;
  lean: string | null;
  lean_label: string | null;
};

export type ConvergenceEvent = {
  id: string;
  title: string | null;
  summary: string | null;
  event_class: string | null;
  risk_score: number | null;
  opportunity_score: number | null;
  confidence: number | null;
  created_at: string;
  outlets: ConvergenceOutlet[];
  n_outlets: number;
  n_with_lean: number;
  distinct_lean_zones: number;
};

export const getConvergenceEvents = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<ConvergenceEvent[]> => {
    const minOutlets = data.minOutlets ?? 2;
    const days = data.days ?? 30;
    const limit = data.limit ?? 20;

    const db = await admin();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1) Recent events (cap scan to a few hundred).
    const { data: events } = await db
      .from("event_candidates")
      .select("id, title, summary, event_class, risk_score, opportunity_score, confidence, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400);
    if (!events || events.length === 0) return [];
    const eventIds = events.map((e) => e.id);

    // 2) Event → atomic_claims via company_impacts.evidence_ids (same as getEventDetail).
    const { data: impacts } = await db
      .from("company_impacts")
      .select("event_candidate_id, evidence_ids")
      .in("event_candidate_id", eventIds);
    const eventToAtomicIds = new Map<string, Set<string>>();
    for (const imp of impacts ?? []) {
      const evId = imp.event_candidate_id as string | null;
      if (!evId) continue;
      const arr = (imp.evidence_ids ?? []) as string[];
      let set = eventToAtomicIds.get(evId);
      if (!set) { set = new Set(); eventToAtomicIds.set(evId, set); }
      for (const a of arr) set.add(a);
    }
    const allAtomicIds = Array.from(new Set(
      Array.from(eventToAtomicIds.values()).flatMap((s) => Array.from(s)),
    ));
    if (allAtomicIds.length === 0) return [];

    // Load atomic → canonical map.
    const atomicToCanonical = new Map<string, string>();
    const canonicalIdSet = new Set<string>();
    // Chunk to keep .in() lists reasonable.
    for (let i = 0; i < allAtomicIds.length; i += 500) {
      const chunk = allAtomicIds.slice(i, i + 500);
      const { data: atomics } = await db
        .from("atomic_claims")
        .select("id, canonical_claim_id")
        .in("id", chunk);
      for (const a of atomics ?? []) {
        if (a.canonical_claim_id) {
          atomicToCanonical.set(a.id, a.canonical_claim_id);
          canonicalIdSet.add(a.canonical_claim_id);
        }
      }
    }
    if (canonicalIdSet.size === 0) return [];

    // Per event → set of canonical_claim_ids.
    const eventToCanonicals = new Map<string, Set<string>>();
    for (const [evId, atomicSet] of eventToAtomicIds) {
      const cans = new Set<string>();
      for (const aid of atomicSet) {
        const cid = atomicToCanonical.get(aid);
        if (cid) cans.add(cid);
      }
      if (cans.size) eventToCanonicals.set(evId, cans);
    }

    // 3) Load claim_lineage for those canonicals, independent only.
    const canonicalIds = Array.from(canonicalIdSet);
    type LineageRow = { canonical_claim_id: string; source_id: string };
    const canonicalToSourceIds = new Map<string, Set<string>>();
    const allSourceIds = new Set<string>();
    for (let i = 0; i < canonicalIds.length; i += 500) {
      const chunk = canonicalIds.slice(i, i + 500);
      const { data: lineage } = await db
        .from("claim_lineage")
        .select("canonical_claim_id, source_id, is_likely_copy, relation_to_origin")
        .in("canonical_claim_id", chunk)
        .eq("is_likely_copy", false)
        .in("relation_to_origin", ["origin_candidate", "independent_support"]);
      for (const l of (lineage ?? []) as Array<LineageRow & { is_likely_copy: boolean | null; relation_to_origin: string | null }>) {
        if (!l.source_id) continue;
        let set = canonicalToSourceIds.get(l.canonical_claim_id);
        if (!set) { set = new Set(); canonicalToSourceIds.set(l.canonical_claim_id, set); }
        set.add(l.source_id);
        allSourceIds.add(l.source_id);
      }
    }
    if (allSourceIds.size === 0) return [];

    // 4) Load sources; reduce to independence_group per source.
    const sourceIdToGroup = new Map<string, string>();
    const groupToDisplay = new Map<string, { domain: string; source_name: string | null }>();
    const sourceIdList = Array.from(allSourceIds);
    for (let i = 0; i < sourceIdList.length; i += 500) {
      const chunk = sourceIdList.slice(i, i + 500);
      const { data: sources } = await db
        .from("sources")
        .select("id, name, independence_group, base_url, feed_url, is_synthetic")
        .in("id", chunk);
      for (const s of sources ?? []) {
        const group = (s.independence_group && s.independence_group.trim())
          ? s.independence_group
          : deriveIndependenceGroup(s.base_url ?? s.feed_url, s.name, !!s.is_synthetic, s.id);
        sourceIdToGroup.set(s.id, group);
        if (!groupToDisplay.has(group)) {
          groupToDisplay.set(group, { domain: group, source_name: s.name ?? null });
        }
      }
    }

    // 5) Load full source_lean table and match by domain === independence_group.
    const { data: leans } = await db
      .from("source_lean")
      .select("domain, outlet_name, lean, lean_label");
    const leanByDomain = new Map<string, { outlet_name: string | null; lean: string | null; lean_label: string | null }>();
    for (const l of leans ?? []) {
      leanByDomain.set(l.domain.toLowerCase(), {
        outlet_name: l.outlet_name ?? null,
        lean: l.lean ?? null,
        lean_label: l.lean_label ?? null,
      });
    }

    // 6) Per event compute distinct independent outlet-groups.
    const results: ConvergenceEvent[] = [];
    for (const evt of events) {
      const cans = eventToCanonicals.get(evt.id);
      if (!cans) continue;
      const groupSet = new Set<string>();
      for (const cid of cans) {
        const srcs = canonicalToSourceIds.get(cid);
        if (!srcs) continue;
        for (const sid of srcs) {
          const g = sourceIdToGroup.get(sid);
          if (g) groupSet.add(g);
        }
      }
      if (groupSet.size < minOutlets) continue;

      const outlets: ConvergenceOutlet[] = Array.from(groupSet).map((group) => {
        const lean = leanByDomain.get(group.toLowerCase()) ?? null;
        const display = groupToDisplay.get(group);
        return {
          domain: group,
          outlet_name: lean?.outlet_name ?? display?.source_name ?? null,
          lean: lean?.lean ?? null,
          lean_label: lean?.lean_label ?? null,
        };
      });
      const distinctLeans = new Set(outlets.map((o) => o.lean).filter((x): x is string => !!x));
      const nWithLean = outlets.filter((o) => o.lean).length;

      results.push({
        id: evt.id,
        title: evt.title,
        summary: evt.summary,
        event_class: evt.event_class,
        risk_score: evt.risk_score,
        opportunity_score: evt.opportunity_score,
        confidence: evt.confidence,
        created_at: evt.created_at,
        outlets: outlets.sort((a, b) => (a.domain < b.domain ? -1 : 1)),
        n_outlets: outlets.length,
        n_with_lean: nWithLean,
        distinct_lean_zones: distinctLeans.size,
      });
    }

    results.sort((a, b) => (b.n_outlets - a.n_outlets) || (b.distinct_lean_zones - a.distinct_lean_zones));
    return results.slice(0, limit);
  });
