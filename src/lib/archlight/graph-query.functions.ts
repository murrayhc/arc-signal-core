import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callJson, guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ============ Types ============
export type GraphRow = {
  entity_id: string;
  name: string;
  stress: number;
  trajectory: number;
  exposure_relevance: number | null;
  path: string[]; // ordered names on the traversal path (source → ... → this row)
  why: string;
};

export type Intent =
  | "neighbors_of_distress"
  | "my_exposure_ranked"
  | "contagion_path"
  | "controls_chain";

const IntentEnum = z.enum([
  "neighbors_of_distress",
  "my_exposure_ranked",
  "contagion_path",
  "controls_chain",
]);

const ParamsSchema = z.object({
  hops: z.number().int().min(1).max(2).optional(),
  threshold: z.number().min(0).max(1).optional(),
  entity_a: z.string().max(200).optional(),
  entity_b: z.string().max(200).optional(),
  entity: z.string().max(200).optional(),
});
type Params = z.infer<typeof ParamsSchema>;

const MAX_ROWS = 20;

// ============ Helpers ============
type EntityLite = {
  id: string;
  canonical_name: string;
  belief_stress: number | null;
  belief_trajectory: number | null;
};
type EdgeLite = {
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  weight: number | null;
  verified: boolean | null;
};

async function loadEntities(db: Awaited<ReturnType<typeof admin>>, ids: string[]): Promise<Map<string, EntityLite>> {
  if (ids.length === 0) return new Map();
  const { data } = await db
    .from("entities")
    .select("id, canonical_name, belief_stress, belief_trajectory")
    .in("id", ids);
  return new Map((data ?? []).map((e) => [e.id, e as EntityLite]));
}

async function findEntityByName(db: Awaited<ReturnType<typeof admin>>, name: string): Promise<EntityLite | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: exact } = await db
    .from("entities")
    .select("id, canonical_name, belief_stress, belief_trajectory")
    .ilike("canonical_name", trimmed)
    .limit(1);
  if (exact && exact.length > 0) return exact[0] as EntityLite;
  const { data: fuzzy } = await db
    .from("entities")
    .select("id, canonical_name, belief_stress, belief_trajectory")
    .ilike("canonical_name", `%${trimmed}%`)
    .limit(1);
  return (fuzzy && fuzzy[0]) ? (fuzzy[0] as EntityLite) : null;
}

async function loadExposedEntityIds(db: Awaited<ReturnType<typeof admin>>): Promise<Map<string, number>> {
  const { data } = await db
    .from("exposure_items")
    .select("entity_id, weight")
    .not("entity_id", "is", null);
  const m = new Map<string, number>();
  for (const r of data ?? []) {
    if (!r.entity_id) continue;
    const w = Number(r.weight ?? 1);
    m.set(r.entity_id as string, Math.max(m.get(r.entity_id as string) ?? 0, w));
  }
  return m;
}

async function loadVerifiedEdgesAround(db: Awaited<ReturnType<typeof admin>>, seedIds: string[]): Promise<EdgeLite[]> {
  if (seedIds.length === 0) return [];
  const [{ data: out }, { data: inc }] = await Promise.all([
    db.from("entity_relationships").select("from_entity_id, to_entity_id, relationship_type, weight, verified").in("from_entity_id", seedIds).eq("verified", true),
    db.from("entity_relationships").select("from_entity_id, to_entity_id, relationship_type, weight, verified").in("to_entity_id", seedIds).eq("verified", true),
  ]);
  return [...(out ?? []), ...(inc ?? [])] as EdgeLite[];
}

// ============ Intent implementations ============

async function qNeighborsOfDistress(db: Awaited<ReturnType<typeof admin>>, params: Params): Promise<GraphRow[]> {
  const hops = params.hops === 2 ? 2 : 1;
  const threshold = params.threshold ?? 0.5;
  const { data: distressed } = await db
    .from("entities")
    .select("id, canonical_name, belief_stress, belief_trajectory")
    .gte("belief_stress", threshold)
    .order("belief_stress", { ascending: false })
    .limit(50);
  const sources = (distressed ?? []) as EntityLite[];
  if (sources.length === 0) return [];

  // BFS expansion up to `hops`.
  const visited = new Map<string, { path: string[]; sourceId: string; sourceName: string }>();
  const frontierIds = sources.map((s) => s.id);
  for (const s of sources) visited.set(s.id, { path: [s.canonical_name], sourceId: s.id, sourceName: s.canonical_name });

  let currentFrontier = frontierIds;
  const entityCache = new Map<string, EntityLite>();
  for (const s of sources) entityCache.set(s.id, s);

  for (let h = 0; h < hops; h++) {
    if (currentFrontier.length === 0) break;
    const edges = await loadVerifiedEdgesAround(db, currentFrontier);
    const nextIds = new Set<string>();
    for (const e of edges) {
      const fromId = e.from_entity_id;
      const toId = e.to_entity_id;
      const anchor = visited.has(fromId) ? fromId : visited.has(toId) ? toId : null;
      if (!anchor) continue;
      const neighbour = anchor === fromId ? toId : fromId;
      if (visited.has(neighbour)) continue;
      const anchorEntry = visited.get(anchor)!;
      // Enrich name later; use placeholder id for now, resolved after batch load.
      visited.set(neighbour, {
        path: [...anchorEntry.path, `[${e.relationship_type}]`, neighbour],
        sourceId: anchorEntry.sourceId,
        sourceName: anchorEntry.sourceName,
      });
      nextIds.add(neighbour);
    }
    currentFrontier = Array.from(nextIds);
  }

  const unknownIds = Array.from(visited.keys()).filter((id) => !entityCache.has(id));
  const loaded = await loadEntities(db, unknownIds);
  for (const [id, ent] of loaded) entityCache.set(id, ent);

  const exposureMap = await loadExposedEntityIds(db);

  const sourceSet = new Set(sources.map((s) => s.id));
  const rows: GraphRow[] = [];
  for (const [id, entry] of visited) {
    if (sourceSet.has(id)) continue; // Report the neighbourhood, not the sources themselves.
    const ent = entityCache.get(id);
    if (!ent) continue;
    // Resolve any placeholder ids in the path (they are entity ids we now know).
    const readablePath = entry.path.map((seg) => entityCache.get(seg)?.canonical_name ?? seg);
    rows.push({
      entity_id: ent.id,
      name: ent.canonical_name,
      stress: Number(ent.belief_stress ?? 0),
      trajectory: Number(ent.belief_trajectory ?? 0),
      exposure_relevance: exposureMap.get(ent.id) ?? null,
      path: readablePath,
      why: `${hops}-hop verified-edge path from distressed source "${entry.sourceName}" (stress ≥ ${(threshold * 100).toFixed(0)}%).`,
    });
  }

  rows.sort((a, b) => {
    const expA = a.exposure_relevance ?? 0;
    const expB = b.exposure_relevance ?? 0;
    if (expB !== expA) return expB - expA;
    return b.stress - a.stress;
  });
  return rows.slice(0, MAX_ROWS);
}

async function qMyExposureRanked(db: Awaited<ReturnType<typeof admin>>): Promise<GraphRow[]> {
  const exposure = await loadExposedEntityIds(db);
  const ids = Array.from(exposure.keys());
  if (ids.length === 0) return [];
  const { data } = await db
    .from("entities")
    .select("id, canonical_name, belief_stress, belief_trajectory, belief_components")
    .in("id", ids)
    .order("belief_stress", { ascending: false });
  const rows: GraphRow[] = [];
  for (const e of (data ?? [])) {
    const comp = (e.belief_components ?? {}) as {
      own?: { total?: number; evidences?: Array<{ event_id: string; contribution: number }> };
      inherited?: { total?: number; sources?: Array<{ neighbour_name: string; relationship_type: string; contribution: number }> };
    };
    const own = Number(comp.own?.total ?? 0);
    const inh = Number(comp.inherited?.total ?? 0);
    let why: string;
    if (own >= inh && own > 0) {
      const ev = comp.own?.evidences?.[0];
      why = ev
        ? `Own signals dominate (${(own * 100).toFixed(0)}%); top event ${ev.event_id.slice(0, 8)} contributed ${(ev.contribution * 100).toFixed(0)}%.`
        : `Own signals dominate (${(own * 100).toFixed(0)}%).`;
    } else if (inh > 0) {
      const src = comp.inherited?.sources?.[0];
      why = src
        ? `Inherited from ${src.neighbour_name} via ${src.relationship_type} (${(inh * 100).toFixed(0)}%).`
        : `Inherited stress from verified neighbours (${(inh * 100).toFixed(0)}%).`;
    } else {
      why = "No belief signal recorded yet.";
    }
    rows.push({
      entity_id: e.id,
      name: e.canonical_name,
      stress: Number(e.belief_stress ?? 0),
      trajectory: Number(e.belief_trajectory ?? 0),
      exposure_relevance: exposure.get(e.id) ?? null,
      path: [e.canonical_name],
      why,
    });
  }
  return rows.slice(0, MAX_ROWS);
}

async function qContagionPath(db: Awaited<ReturnType<typeof admin>>, params: Params): Promise<GraphRow[]> {
  if (!params.entity_a || !params.entity_b) return [];
  const [a, b] = await Promise.all([
    findEntityByName(db, params.entity_a),
    findEntityByName(db, params.entity_b),
  ]);
  if (!a || !b) return [];
  if (a.id === b.id) return [];

  // BFS up to 4 hops over verified edges (both directions).
  const parents = new Map<string, { prevId: string; relType: string }>();
  parents.set(a.id, { prevId: "", relType: "" });
  let frontier = [a.id];
  const entityCache = new Map<string, EntityLite>();
  entityCache.set(a.id, a);
  entityCache.set(b.id, b);
  let found = false;
  for (let h = 0; h < 4 && !found; h++) {
    const edges = await loadVerifiedEdgesAround(db, frontier);
    const next = new Set<string>();
    for (const e of edges) {
      const from = e.from_entity_id;
      const to = e.to_entity_id;
      const seen = parents.has(from) ? from : parents.has(to) ? to : null;
      if (!seen) continue;
      const other = seen === from ? to : from;
      if (parents.has(other)) continue;
      parents.set(other, { prevId: seen, relType: e.relationship_type });
      if (other === b.id) { found = true; break; }
      next.add(other);
    }
    frontier = Array.from(next);
  }
  if (!parents.has(b.id)) return [];

  // Reconstruct path b → ... → a, then reverse.
  const chain: Array<{ id: string; relType: string }> = [];
  let cur = b.id;
  while (cur) {
    const p = parents.get(cur);
    if (!p) break;
    chain.push({ id: cur, relType: p.relType });
    if (p.prevId === "") break;
    cur = p.prevId;
  }
  chain.reverse();

  const idsToLoad = chain.map((c) => c.id).filter((id) => !entityCache.has(id));
  for (const [id, ent] of await loadEntities(db, idsToLoad)) entityCache.set(id, ent);

  const exposure = await loadExposedEntityIds(db);
  const nameChain: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const ent = entityCache.get(chain[i].id)!;
    if (i > 0) nameChain.push(`[${chain[i].relType}]`);
    nameChain.push(ent.canonical_name);
  }
  const chainDescription = nameChain.join(" ");

  const rows: GraphRow[] = chain.map((c) => {
    const ent = entityCache.get(c.id)!;
    return {
      entity_id: ent.id,
      name: ent.canonical_name,
      stress: Number(ent.belief_stress ?? 0),
      trajectory: Number(ent.belief_trajectory ?? 0),
      exposure_relevance: exposure.get(ent.id) ?? null,
      path: nameChain.slice(),
      why: `On verified-edge path from ${a.canonical_name} to ${b.canonical_name}: ${chainDescription}.`,
    };
  });
  return rows;
}

async function qControlsChain(db: Awaited<ReturnType<typeof admin>>, params: Params): Promise<GraphRow[]> {
  const name = params.entity ?? params.entity_a;
  if (!name) return [];
  const seed = await findEntityByName(db, name);
  if (!seed) return [];

  const entityCache = new Map<string, EntityLite>();
  entityCache.set(seed.id, seed);
  const collected = new Map<string, { path: string[]; direction: "up" | "down" }>();

  // UP: who controls seed (incoming controls edges).
  let cursor = seed.id;
  let upPath = [seed.canonical_name];
  for (let h = 0; h < 4; h++) {
    const { data } = await db
      .from("entity_relationships")
      .select("from_entity_id, to_entity_id, relationship_type, weight, verified")
      .eq("verified", true)
      .eq("relationship_type", "controls")
      .eq("to_entity_id", cursor)
      .limit(1);
    const edge = (data ?? [])[0];
    if (!edge) break;
    const parentId = edge.from_entity_id as string;
    if (collected.has(parentId)) break;
    const [ent] = [...(await loadEntities(db, [parentId])).values()];
    if (!ent) break;
    entityCache.set(parentId, ent);
    upPath = [...upPath, "[controls]", ent.canonical_name];
    collected.set(parentId, { path: upPath.slice().reverse(), direction: "up" });
    cursor = parentId;
  }

  // DOWN: who does seed control (outgoing controls edges), BFS.
  const downFrontier: Array<{ id: string; path: string[] }> = [{ id: seed.id, path: [seed.canonical_name] }];
  const downVisited = new Set<string>([seed.id]);
  for (let h = 0; h < 4 && downFrontier.length > 0; h++) {
    const nextFrontier: Array<{ id: string; path: string[] }> = [];
    const currentIds = downFrontier.map((f) => f.id);
    const { data } = await db
      .from("entity_relationships")
      .select("from_entity_id, to_entity_id, relationship_type, weight, verified")
      .eq("verified", true)
      .eq("relationship_type", "controls")
      .in("from_entity_id", currentIds);
    for (const edge of data ?? []) {
      const parent = downFrontier.find((f) => f.id === edge.from_entity_id);
      if (!parent) continue;
      const childId = edge.to_entity_id as string;
      if (downVisited.has(childId)) continue;
      downVisited.add(childId);
      const childEnts = await loadEntities(db, [childId]);
      const ent = childEnts.get(childId);
      if (!ent) continue;
      entityCache.set(childId, ent);
      const newPath = [...parent.path, "[controls]", ent.canonical_name];
      collected.set(childId, { path: newPath, direction: "down" });
      nextFrontier.push({ id: childId, path: newPath });
    }
    downFrontier.splice(0, downFrontier.length, ...nextFrontier);
  }

  const exposure = await loadExposedEntityIds(db);
  const rows: GraphRow[] = [];
  for (const [id, entry] of collected) {
    const ent = entityCache.get(id);
    if (!ent) continue;
    rows.push({
      entity_id: ent.id,
      name: ent.canonical_name,
      stress: Number(ent.belief_stress ?? 0),
      trajectory: Number(ent.belief_trajectory ?? 0),
      exposure_relevance: exposure.get(ent.id) ?? null,
      path: entry.path,
      why: entry.direction === "up"
        ? `Registry-verified controlling parent above ${seed.canonical_name}.`
        : `Registry-verified subsidiary controlled by ${seed.canonical_name}.`,
    });
  }
  return rows.slice(0, MAX_ROWS);
}

// ============ Exported serverFns ============

export const graphQuery = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ intent: IntentEnum, params: ParamsSchema.default({}) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    let rows: GraphRow[] = [];
    if (data.intent === "neighbors_of_distress") rows = await qNeighborsOfDistress(db, data.params);
    else if (data.intent === "my_exposure_ranked") rows = await qMyExposureRanked(db);
    else if (data.intent === "contagion_path") rows = await qContagionPath(db, data.params);
    else if (data.intent === "controls_chain") rows = await qControlsChain(db, data.params);
    return { intent: data.intent, params: data.params, rows };
  });

const CANT_MAP_MESSAGE =
  "I can't answer that from the graph yet — try: 'who is exposed to distress', 'rank my exposures by stress', 'how is A connected to B', 'who controls X'.";

export const askGraph = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ question: z.string().min(3).max(400) }).parse(d))
  .handler(async ({ data }) => {
    // 1. Classify question → intent + params. LLM never produces facts, only routes.
    const cls = await callJson<{
      mapped: boolean;
      intent?: Intent;
      params?: Params;
      reason?: string;
    }>({
      task: "query_generation",
      system:
        "You classify a natural-language question about a companies-and-relationships graph into EXACTLY ONE of four fixed query intents, and extract parameters. Return ONLY strict JSON. Never invent facts. If the question does not clearly map to one intent, return {\"mapped\":false}.\n" +
        "Intents:\n" +
        "1. neighbors_of_distress — 'who is exposed to distress', 'what companies are near stressed suppliers'. Params: hops (1 or 2, default 1), threshold (0..1, default 0.5).\n" +
        "2. my_exposure_ranked — 'rank my exposures by stress', 'what am I most exposed to'. No params.\n" +
        "3. contagion_path — 'how is A connected to B', 'path from A to B'. Params: entity_a, entity_b (extract the two names verbatim from the question).\n" +
        "4. controls_chain — 'who controls X', 'what does X own', 'ownership chain of X'. Params: entity (the named company).\n" +
        "Return shape when mapped: {\"mapped\":true,\"intent\":\"...\",\"params\":{...}}. When not mapped: {\"mapped\":false,\"reason\":\"...\"}. No advice, no financial recommendations.",
      user: `Question: ${data.question}`,
    });

    if (!cls.ok || !cls.data || cls.data.mapped !== true || !cls.data.intent) {
      return { mapped: false as const, message: CANT_MAP_MESSAGE };
    }

    // 2. Validate the mapping through the same strict schema before execution.
    const parseRes = z.object({ intent: IntentEnum, params: ParamsSchema.default({}) }).safeParse({
      intent: cls.data.intent,
      params: cls.data.params ?? {},
    });
    if (!parseRes.success) {
      return { mapped: false as const, message: CANT_MAP_MESSAGE };
    }
    const { intent, params } = parseRes.data;

    // 3. Deterministic query — no LLM in the answer path.
    const db = await admin();
    let rows: GraphRow[] = [];
    if (intent === "neighbors_of_distress") rows = await qNeighborsOfDistress(db, params);
    else if (intent === "my_exposure_ranked") rows = await qMyExposureRanked(db);
    else if (intent === "contagion_path") rows = await qContagionPath(db, params);
    else if (intent === "controls_chain") rows = await qControlsChain(db, params);

    // 4. Factual, guardrailed summary derived from rows (not from the LLM).
    const summary = summariseRows(intent, params, rows);
    const g = guardFinancialAdvice(summary);
    return {
      mapped: true as const,
      intent,
      params,
      rows,
      summary: g.ok ? summary : `${rows.length} result(s) from the graph.`,
    };
  });

function summariseRows(intent: Intent, params: Params, rows: GraphRow[]): string {
  if (rows.length === 0) {
    if (intent === "contagion_path") return `No verified-edge path found between ${params.entity_a ?? "A"} and ${params.entity_b ?? "B"} within 4 hops.`;
    if (intent === "controls_chain") return `No registry-verified ownership chain found for ${params.entity ?? "the entity"}.`;
    if (intent === "my_exposure_ranked") return "No exposed entities with belief state yet.";
    return "No matching entities in the graph.";
  }
  const top = rows[0];
  if (intent === "neighbors_of_distress") {
    return `${rows.length} entit${rows.length === 1 ? "y is" : "ies are"} within ${params.hops ?? 1} verified-edge hop(s) of distress; highest belief stress is ${top.name} at ${(top.stress * 100).toFixed(0)}%. Information only, not advice.`;
  }
  if (intent === "my_exposure_ranked") {
    return `${rows.length} of your exposed entit${rows.length === 1 ? "y" : "ies"} carry belief state; ${top.name} leads at ${(top.stress * 100).toFixed(0)}% stress. Information only, not advice.`;
  }
  if (intent === "contagion_path") {
    return `Verified-edge path in ${rows.length} step(s): ${rows[0].path.join(" ")}. Information only, not advice.`;
  }
  return `Registry-verified ownership chain returned ${rows.length} node(s). Information only, not advice.`;
}
