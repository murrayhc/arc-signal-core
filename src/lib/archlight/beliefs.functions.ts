import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function clampSigned(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

// Decay: half-life 30d toward 0.
function decayStress(prev: number, updatedAt: string | null): number {
  if (prev <= 0) return 0;
  if (!updatedAt) return prev;
  const ms = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(ms) || ms <= 0) return prev;
  const days = ms / (24 * 3600 * 1000);
  return prev * Math.pow(0.5, days / 30);
}

// Recency factor for an event contribution: 1.0 at now, ~0.5 at 30d.
function eventRecencyFactor(iso: string | null): number {
  if (!iso) return 0.5;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  const days = ms / (24 * 3600 * 1000);
  return Math.max(0.2, Math.pow(0.5, days / 30));
}

// ============ updateBeliefs ============
// Non-fatal, bounded pass. Decay → own contribution (from this scan's events)
// → single damped one-hop propagation over VERIFIED registry edges.
type BeliefResult = {
  entities_touched: number;
  entities_updated: number;
  history_rows: number;
  reviews_raised: number;
  notes: string[];
};

export const updateBeliefs = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => z.object({ scanRunId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<BeliefResult> => {
    const db = await admin();
    const notes: string[] = [];

    // 1. Events this scan produced or updated.
    const { data: scanEvents } = await db
      .from("event_candidates")
      .select("id, primary_entity_id, risk_score, confidence, last_updated_at")
      .eq("created_from_scan_run_id", data.scanRunId);
    const eventList = scanEvents ?? [];
    if (eventList.length === 0) {
      return { entities_touched: 0, entities_updated: 0, history_rows: 0, reviews_raised: 0, notes: ["No scan events; belief pass skipped."] };
    }
    const eventIds = eventList.map((e) => e.id);
    const eventById = new Map(eventList.map((e) => [e.id, e] as const));

    // 2. Company impacts on those events (entity-linked only).
    const { data: impactRows } = await db
      .from("company_impacts")
      .select("event_candidate_id, entity_id, confidence, company_name")
      .in("event_candidate_id", eventIds);
    const impacts = (impactRows ?? []).filter((i): i is typeof i & { entity_id: string } => !!i.entity_id);

    // 3. Touched entity ids = primary_entity_id ∪ impact.entity_id.
    const touched = new Set<string>();
    for (const e of eventList) if (e.primary_entity_id) touched.add(e.primary_entity_id as string);
    for (const im of impacts) touched.add(im.entity_id);
    if (touched.size === 0) {
      return { entities_touched: 0, entities_updated: 0, history_rows: 0, reviews_raised: 0, notes: ["No entity-linked events; belief pass skipped."] };
    }

    // 4. One-hop verified neighbours of touched entities.
    const touchedArr = Array.from(touched);
    const { data: outEdges } = await db
      .from("entity_relationships")
      .select("from_entity_id, to_entity_id, relationship_type, weight, verified")
      .in("from_entity_id", touchedArr);
    const { data: inEdges } = await db
      .from("entity_relationships")
      .select("from_entity_id, to_entity_id, relationship_type, weight, verified")
      .in("to_entity_id", touchedArr);
    const allEdges = [...(outEdges ?? []), ...(inEdges ?? [])].filter((e) => e.verified === true);

    const involved = new Set<string>(touched);
    for (const e of allEdges) {
      involved.add(e.from_entity_id as string);
      involved.add(e.to_entity_id as string);
    }

    // 5. Load current entity state + distress profiles + names.
    const involvedArr = Array.from(involved);
    const { data: entityRows } = await db
      .from("entities")
      .select("id, canonical_name, belief_stress, belief_updated_at")
      .in("id", involvedArr);
    const entityById = new Map((entityRows ?? []).map((r) => [r.id, r] as const));

    const { data: distressRows } = await db
      .from("company_distress_profiles")
      .select("entity_id, profile_score")
      .in("entity_id", involvedArr);
    const distressByEntity = new Map((distressRows ?? []).map((r) => [r.entity_id as string, Number(r.profile_score ?? 0)] as const));

    // 6. Pre-update snapshot + decayed stress per involved entity.
    const prevStress = new Map<string, number>();
    const decayed = new Map<string, number>();
    for (const id of involvedArr) {
      const row = entityById.get(id);
      const prev = Number(row?.belief_stress ?? 0);
      prevStress.set(id, prev);
      decayed.set(id, clamp01(decayStress(prev, row?.belief_updated_at ?? null)));
    }

    // 7. Own contribution for TOUCHED entities from this scan's events.
    // For each touched entity, iterate its events (primary or impact) and pick
    // the max event contribution: event.risk * blend(event.conf, impact.conf) * recency.
    type OwnEvidence = { event_id: string; contribution: number; risk: number; confidence: number };
    const ownByEntity = new Map<string, { total: number; evidences: OwnEvidence[] }>();
    for (const eid of touched) ownByEntity.set(eid, { total: 0, evidences: [] });

    const addOwn = (entityId: string, ev: typeof eventList[number], claimConf: number) => {
      const bucket = ownByEntity.get(entityId);
      if (!bucket) return;
      const risk = Number(ev.risk_score ?? 0);
      const evConf = Number(ev.confidence ?? 0);
      const blended = (evConf + claimConf) / 2 || evConf;
      const recency = eventRecencyFactor(ev.last_updated_at ?? null);
      const contribution = clamp01(risk * blended * recency);
      if (contribution <= 0.01) return;
      bucket.evidences.push({ event_id: ev.id, contribution: Number(contribution.toFixed(3)), risk: Number(risk.toFixed(3)), confidence: Number(blended.toFixed(3)) });
      bucket.total = Math.max(bucket.total, contribution); // clamp OVER events → take max (spec: "clamp over its events")
    };

    for (const ev of eventList) {
      if (ev.primary_entity_id && touched.has(ev.primary_entity_id as string)) {
        addOwn(ev.primary_entity_id as string, ev, Number(ev.confidence ?? 0));
      }
    }
    for (const im of impacts) {
      if (!im.event_candidate_id) continue;
      const ev = eventById.get(im.event_candidate_id);
      if (!ev) continue;
      addOwn(im.entity_id, ev, Number(im.confidence ?? 0));
    }

    // Blend in distress profile score (own signal, non-event).
    for (const eid of touched) {
      const bucket = ownByEntity.get(eid);
      if (!bucket) continue;
      const dp = distressByEntity.get(eid);
      if (dp && dp > 0) {
        // Take the max of event-derived and distress-derived own signal.
        bucket.total = Math.max(bucket.total, dp * 0.9);
      }
    }

    // 8. Inherited (one-hop damped, single pass) for every involved entity.
    // Sum over verified edges (either direction) of neighbour.decayed * weight * 0.4, capped 0.5.
    type Inherited = { neighbour_id: string; neighbour_name: string; relationship_type: string; contribution: number };
    const inheritedByEntity = new Map<string, { total: number; sources: Inherited[] }>();
    for (const idv of involvedArr) inheritedByEntity.set(idv, { total: 0, sources: [] });

    const addInherited = (target: string, neighbour: string, relType: string, weight: number) => {
      if (target === neighbour) return;
      const nStress = decayed.get(neighbour) ?? 0;
      if (nStress <= 0) return;
      const contribution = nStress * Math.max(0, Math.min(1, weight)) * 0.4;
      if (contribution <= 0.005) return;
      const bucket = inheritedByEntity.get(target);
      if (!bucket) return;
      const nName = entityById.get(neighbour)?.canonical_name ?? "unknown";
      bucket.sources.push({ neighbour_id: neighbour, neighbour_name: nName, relationship_type: relType, contribution: Number(contribution.toFixed(3)) });
      bucket.total += contribution;
    };

    for (const e of allEdges) {
      const from = e.from_entity_id as string;
      const to = e.to_entity_id as string;
      const w = Number(e.weight ?? 0);
      const rt = String(e.relationship_type ?? "related");
      addInherited(to, from, rt, w);
      addInherited(from, to, rt, w);
    }
    // Cap inherited at 0.5.
    for (const [, b] of inheritedByEntity) {
      if (b.total > 0.5) {
        const scale = 0.5 / b.total;
        b.total = 0.5;
        b.sources = b.sources.map((s) => ({ ...s, contribution: Number((s.contribution * scale).toFixed(3)) }));
      }
    }

    // 9. Combine, persist, insert history, raise reviews on threshold crossing.
    let updated = 0;
    let historyRows = 0;
    let reviewsRaised = 0;

    // Load exposure_items to know which entities the user is exposed to.
    const { data: expItems } = await db
      .from("exposure_items")
      .select("entity_id")
      .in("entity_id", involvedArr);
    const exposedEntities = new Set((expItems ?? []).map((r) => r.entity_id as string).filter(Boolean));

    const nowIso = new Date().toISOString();

    for (const id of involvedArr) {
      const prev = prevStress.get(id) ?? 0;
      const dec = decayed.get(id) ?? 0;
      const own = ownByEntity.get(id)?.total ?? 0;
      const inh = inheritedByEntity.get(id)?.total ?? 0;
      const newStress = clamp01(dec + own + inh);
      const trajectory = clampSigned(newStress - prev);

      // Skip write if nothing meaningful changed.
      if (Math.abs(newStress - prev) < 0.005 && Math.abs(prev) < 0.005) continue;

      const components = {
        decayed_from: Number(prev.toFixed(3)),
        decayed_now: Number(dec.toFixed(3)),
        own: {
          total: Number(own.toFixed(3)),
          evidences: ownByEntity.get(id)?.evidences ?? [],
          distress_profile_score: distressByEntity.get(id) ?? null,
        },
        inherited: {
          total: Number(inh.toFixed(3)),
          sources: inheritedByEntity.get(id)?.sources ?? [],
        },
        computed_at: nowIso,
      };

      const trigger = touched.has(id)
        ? `scan:${data.scanRunId.slice(0, 8)} own=${own.toFixed(2)} inh=${inh.toFixed(2)}`
        : `neighbour-propagation scan:${data.scanRunId.slice(0, 8)} inh=${inh.toFixed(2)}`;

      const { error: upErr } = await db
        .from("entities")
        .update({
          belief_stress: Number(newStress.toFixed(4)),
          belief_trajectory: Number(trajectory.toFixed(4)),
          belief_updated_at: nowIso,
          belief_components: components,
        })
        .eq("id", id);
      if (upErr) {
        notes.push(`belief update failed for ${id.slice(0, 8)}: ${upErr.message}`);
        continue;
      }
      updated++;

      const { error: hErr } = await db.from("entity_belief_history").insert({
        entity_id: id,
        stress: Number(newStress.toFixed(4)),
        trajectory: Number(trajectory.toFixed(4)),
        trigger: trigger.slice(0, 200),
      });
      if (!hErr) historyRows++;

      // Threshold crossing → review_queue for exposed entities.
      if (prev < 0.6 && newStress >= 0.6 && exposedEntities.has(id)) {
        const { data: existing } = await db
          .from("review_queue")
          .select("id")
          .eq("item_type", "belief_stress")
          .eq("item_id", id)
          .eq("status", "pending")
          .limit(1);
        if (!existing || existing.length === 0) {
          const name = entityById.get(id)?.canonical_name ?? "entity";
          const reason = `Belief stress crossed ${(newStress * 100).toFixed(0)}% for ${name} — own signal ${(own * 100).toFixed(0)}%, inherited ${(inh * 100).toFixed(0)}%.`;
          const { error: rErr } = await db.from("review_queue").insert({
            item_type: "belief_stress",
            item_id: id,
            reason: reason.slice(0, 500),
            status: "pending",
          });
          if (!rErr) reviewsRaised++;
        }
      }
    }

    notes.push(`Belief pass: touched ${touched.size}, involved ${involvedArr.length}, updated ${updated}, history ${historyRows}, reviews ${reviewsRaised}.`);
    return {
      entities_touched: touched.size,
      entities_updated: updated,
      history_rows: historyRows,
      reviews_raised: reviewsRaised,
      notes,
    };
  });

// ============ READS ============

export const getBeliefState = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ entityId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: ent }, { data: history }] = await Promise.all([
      db.from("entities").select("id, canonical_name, belief_stress, belief_trajectory, belief_updated_at, belief_components").eq("id", data.entityId).maybeSingle(),
      db.from("entity_belief_history").select("id, at, stress, trajectory, trigger").eq("entity_id", data.entityId).order("at", { ascending: false }).limit(40),
    ]);
    return {
      entity: ent ?? null,
      history: (history ?? []).map((h) => ({
        id: h.id,
        at: h.at,
        stress: Number(h.stress ?? 0),
        trajectory: Number(h.trajectory ?? 0),
        trigger: h.trigger ?? "",
      })),
    };
  });

// Rising-stress rail: entities the user is exposed to, ordered by belief_stress.
export const getRisingStressRail = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = await admin();
    const { data: expItems } = await db
      .from("exposure_items")
      .select("entity_id, name")
      .not("entity_id", "is", null);
    const entityIds = Array.from(new Set((expItems ?? []).map((r) => r.entity_id as string).filter(Boolean)));
    if (entityIds.length === 0) return { rows: [] };
    const { data: entRows } = await db
      .from("entities")
      .select("id, canonical_name, sector, region, belief_stress, belief_trajectory, belief_updated_at")
      .in("id", entityIds)
      .order("belief_stress", { ascending: false })
      .limit(8);
    return {
      rows: (entRows ?? []).filter((e) => Number(e.belief_stress ?? 0) > 0.01).map((e) => ({
        entity_id: e.id,
        name: e.canonical_name,
        sector: e.sector,
        region: e.region,
        stress: Number(e.belief_stress ?? 0),
        trajectory: Number(e.belief_trajectory ?? 0),
        updated_at: e.belief_updated_at,
      })),
    };
  });
