// Registry graph builder — replaces LLM-guessed relationships with
// Companies House fact. Two edge families:
//   - PSC (persons with significant control) → 'controls' from parent to child.
//   - Shared officers across ≥2 candidate companies → 'shared_officer' both ways.
//
// Idempotent: upserts on (from_entity_id, to_entity_id, relationship_type).
// Verified edges (source='companies_house') always win over inferred ones.
// Guardrails: real CH data only, bounded API usage, respects 429/403.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chPSC,
  chOfficers,
  resolveCompanyNumber,
  type CHOfficerItem,
  type CHPSCItem,
} from "./collectors/companies-house.server";


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

interface CandidateEntity {
  id: string;
  canonical_name: string;
  entity_type: string;
  company_number: string | null;
  company_number_checked_at: string | null;
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// PSC natures of control → weight for the 'controls' edge.
// The strongest nature wins; if none match a band, fall back to 0.35.
function weightFromNatures(natures: string[]): number {
  const s = natures.map((n) => n.toLowerCase());
  const has = (frag: string) => s.some((n) => n.includes(frag));
  if (has("75-to-100-percent")) return 0.9;
  if (has("50-to-75-percent")) return 0.75;
  if (has("25-to-50-percent")) return 0.5;
  return 0.35;
}
function topNature(natures: string[]): string {
  if (!natures.length) return "significant control";
  // Prefer the highest ownership/voting band; else first.
  const order = ["75-to-100-percent", "50-to-75-percent", "25-to-50-percent"];
  for (const band of order) {
    const hit = natures.find((n) => n.toLowerCase().includes(band));
    if (hit) return hit;
  }
  return natures[0];
}

// Upsert an entity_relationships edge. Verified edges win over inferred ones.
async function upsertEdge(
  db: Awaited<ReturnType<typeof admin>>,
  edge: {
    from_entity_id: string;
    to_entity_id: string;
    relationship_type: string;
    weight: number;
    rationale: string;
    natures: string[];
  },
): Promise<"inserted" | "updated" | "skipped"> {
  if (edge.from_entity_id === edge.to_entity_id) return "skipped";
  const { data: existing } = await db
    .from("entity_relationships")
    .select("id, source, verified, weight")
    .eq("from_entity_id", edge.from_entity_id)
    .eq("to_entity_id", edge.to_entity_id)
    .eq("relationship_type", edge.relationship_type)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("entity_relationships")
      .update({
        source: "companies_house",
        verified: true,
        weight: edge.weight,
        rationale: edge.rationale,
        natures: edge.natures as unknown as never,
      })
      .eq("id", existing.id);
    if (error) return "skipped";
    return "updated";
  }

  const { error } = await db.from("entity_relationships").insert({
    from_entity_id: edge.from_entity_id,
    to_entity_id: edge.to_entity_id,
    relationship_type: edge.relationship_type,
    weight: edge.weight,
    rationale: edge.rationale,
    source: "companies_house",
    verified: true,
    natures: edge.natures as unknown as never,
  });
  return error ? "skipped" : "inserted";
}

async function findOrCreateParentEntity(
  db: Awaited<ReturnType<typeof admin>>,
  name: string,
  registrationNumber: string | null,
): Promise<string | null> {
  const canonical = name.trim();
  if (!canonical) return null;
  // Try by company_number first (strongest identity).
  if (registrationNumber) {
    const { data: byNum } = await db
      .from("entities")
      .select("id, canonical_name")
      .eq("company_number", registrationNumber)
      .maybeSingle();
    if (byNum) return byNum.id;
  }
  // Then by canonical_name (case-insensitive).
  const { data: byName } = await db
    .from("entities")
    .select("id, company_number")
    .ilike("canonical_name", canonical)
    .maybeSingle();
  if (byName) {
    if (registrationNumber && !byName.company_number) {
      await db.from("entities").update({ company_number: registrationNumber }).eq("id", byName.id);
    }
    return byName.id;
  }
  // Create.
  const insert = await db
    .from("entities")
    .insert({
      canonical_name: canonical,
      entity_type: "organization",
      company_number: registrationNumber,
      aliases: [],
    })
    .select("id")
    .single();
  if (insert.error) return null;
  return insert.data.id;
}

export interface BuildRegistryResult {
  companies_checked: number;
  psc_edges: number;
  shared_officer_edges: number;
  numbers_resolved: number;
  notes: string[];
}

export async function buildRegistryEdges(opts: { maxCompanies?: number } = {}): Promise<BuildRegistryResult> {
  const notes: string[] = [];
  const result: BuildRegistryResult = {
    companies_checked: 0,
    psc_edges: 0,
    shared_officer_edges: 0,
    numbers_resolved: 0,
    notes,
  };
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    notes.push("Registry: COMPANIES_HOUSE_API_KEY not set — skipping.");
    return result;
  }
  const maxCompanies = Math.max(1, Math.min(100, opts.maxCompanies ?? 20));
  const db = await admin();

  // 1. Candidate entities: exposed OR behind open predictions OR in distress cohort.
  const [exposureItems, openPreds, cohort] = await Promise.all([
    db.from("exposure_items").select("entity_id").not("entity_id", "is", null),
    db.from("outcome_predictions").select("event_candidate_id").eq("status", "open"),
    db.from("distress_cohort").select("entity_id").not("entity_id", "is", null),
  ]);
  const entityIdSet = new Set<string>();
  for (const r of exposureItems.data ?? []) if (r.entity_id) entityIdSet.add(r.entity_id);
  for (const r of cohort.data ?? []) if (r.entity_id) entityIdSet.add(r.entity_id);
  const eventIds = Array.from(new Set((openPreds.data ?? []).map((r) => r.event_candidate_id).filter(Boolean)));
  if (eventIds.length) {
    const { data: evs } = await db
      .from("event_candidates")
      .select("primary_entity_id")
      .in("id", eventIds);
    for (const r of evs ?? []) if (r.primary_entity_id) entityIdSet.add(r.primary_entity_id);
  }
  if (entityIdSet.size === 0) {
    notes.push("Registry: no candidate entities.");
    return result;
  }

  const { data: entities } = await db
    .from("entities")
    .select("id, canonical_name, entity_type, company_number, company_number_checked_at")
    .in("id", Array.from(entityIdSet))
    .eq("entity_type", "organization")
    .order("company_number_checked_at", { ascending: true, nullsFirst: true })
    .limit(maxCompanies);
  const candidates = (entities ?? []) as CandidateEntity[];
  if (candidates.length === 0) {
    notes.push("Registry: no organization-type candidates.");
    return result;
  }

  // 2. Resolve company_number for each candidate; keep only those with a number.
  const resolved: Array<CandidateEntity & { company_number: string }> = [];
  let rateLimited = false;
  for (const ent of candidates) {
    if (rateLimited) break;
    let num = ent.company_number;
    if (!num) {
      try {
        num = await resolveCompanyNumber(db, ent, apiKey);
        if (num) result.numbers_resolved++;
      } catch { rateLimited = true; break; }
    }
    if (num) resolved.push({ ...ent, company_number: num });
  }

  // 3. PSC edges + collect officers per company.
  const officersByCompany = new Map<string, { entityId: string; officers: CHOfficerItem[] }>();
  for (const ent of resolved) {
    if (rateLimited) break;
    result.companies_checked++;
    let pscs: CHPSCItem[] = [];
    try {
      pscs = await chPSC(ent.company_number, apiKey);
    } catch { rateLimited = true; break; }

    for (const p of pscs) {
      if (p.ceased_on) continue;
      const kind = (p.kind ?? "").toLowerCase();
      if (!kind.includes("corporate-entity")) continue; // only corporate parents build graph edges
      const parentName = (p.name ?? "").trim();
      if (!parentName) continue;
      const regNum = p.identification?.registration_number?.trim() || null;
      const natures = p.natures_of_control ?? [];
      const parentId = await findOrCreateParentEntity(db, parentName, regNum);
      if (!parentId) continue;
      const weight = weightFromNatures(natures);
      const rationale = `Companies House PSC: ${topNature(natures)}`;
      const r = await upsertEdge(db, {
        from_entity_id: parentId,
        to_entity_id: ent.id,
        relationship_type: "controls",
        weight,
        rationale,
        natures,
      });
      if (r === "inserted" || r === "updated") result.psc_edges++;
    }

    // Fetch officers for shared-director analysis.
    try {
      const officers = await chOfficers(ent.company_number, apiKey);
      officersByCompany.set(ent.company_number, { entityId: ent.id, officers });
    } catch { rateLimited = true; break; }
  }

  // 4. Shared officer edges.
  //    Identity = normalized name + dob month/year (dob may be absent for
  //    corporate officers; those keys collapse to name-only, which is coarse
  //    but acceptable for candidate companies we already narrowed).
  interface CompanyRef { entityId: string; companyNumber: string }
  const officerIndex = new Map<string, { name: string; companies: CompanyRef[] }>();
  for (const [companyNumber, { entityId, officers }] of officersByCompany) {
    for (const o of officers) {
      if (o.resigned_on) continue;
      const name = (o.name ?? "").trim();
      if (!name) continue;
      const key = normName(name); // simple identity — coarse but safe within bounded candidate set
      if (!officerIndex.has(key)) officerIndex.set(key, { name, companies: [] });
      const bucket = officerIndex.get(key)!;
      if (!bucket.companies.some((c) => c.entityId === entityId)) {
        bucket.companies.push({ entityId, companyNumber });
      }
    }
  }
  for (const { name, companies } of officerIndex.values()) {
    if (companies.length < 2) continue;
    for (let i = 0; i < companies.length; i++) {
      for (let j = 0; j < companies.length; j++) {
        if (i === j) continue;
        const a = companies[i];
        const b = companies[j];
        const r = await upsertEdge(db, {
          from_entity_id: a.entityId,
          to_entity_id: b.entityId,
          relationship_type: "shared_officer",
          weight: 0.4,
          rationale: `Companies House: shared director ${name}`,
          natures: [name],
        });
        if (r === "inserted" || r === "updated") result.shared_officer_edges++;
      }
    }
  }

  if (rateLimited) notes.push("Registry: stopped early — Companies House rate limited.");
  notes.push(
    `Registry: checked ${result.companies_checked} company(ies), resolved ${result.numbers_resolved} number(s), ` +
    `${result.psc_edges} PSC edge(s), ${result.shared_officer_edges} shared-officer edge(s).`,
  );
  return result;
}

// --- Server function wrappers ---

const BuildInput = z.object({ maxCompanies: z.number().int().positive().max(100).optional() });
export const rebuildRegistryGraph = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => BuildInput.parse(d ?? {}))
  .handler(async ({ data }) => buildRegistryEdges({ maxCompanies: data.maxCompanies ?? 20 }));

// Read verified edges for an entity — used by the company page panel.
const ReadInput = z.object({ entityId: z.string().uuid() });
export const getRegistryEdges = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ReadInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: out }, { data: incoming }] = await Promise.all([
      db.from("entity_relationships")
        .select("relationship_type, weight, rationale, natures, to_entity_id, verified, source")
        .eq("from_entity_id", data.entityId)
        .eq("source", "companies_house"),
      db.from("entity_relationships")
        .select("relationship_type, weight, rationale, natures, from_entity_id, verified, source")
        .eq("to_entity_id", data.entityId)
        .eq("source", "companies_house"),
    ]);
    const ids = Array.from(new Set([
      ...(out ?? []).map((r) => r.to_entity_id as string),
      ...(incoming ?? []).map((r) => r.from_entity_id as string),
    ]));
    const { data: peers } = ids.length
      ? await db.from("entities").select("id, canonical_name, company_number").in("id", ids)
      : { data: [] };
    const peerMap = new Map((peers ?? []).map((p) => [p.id, p]));
    const outgoing = (out ?? []).map((r) => {
      const p = peerMap.get(r.to_entity_id);
      return {
        entity_id: r.to_entity_id,
        canonical_name: p?.canonical_name ?? "(unknown)",
        company_number: p?.company_number ?? null,
        relationship_type: r.relationship_type,
        weight: Number(r.weight),
        rationale: r.rationale,
        natures: (r.natures as string[] | null) ?? [],
        direction: "outgoing" as const,
      };
    });
    const inbound = (incoming ?? []).map((r) => {
      const p = peerMap.get(r.from_entity_id);
      return {
        entity_id: r.from_entity_id,
        canonical_name: p?.canonical_name ?? "(unknown)",
        company_number: p?.company_number ?? null,
        relationship_type: r.relationship_type,
        weight: Number(r.weight),
        rationale: r.rationale,
        natures: (r.natures as string[] | null) ?? [],
        direction: "incoming" as const,
      };
    });
    return { outgoing, incoming: inbound };
  });
