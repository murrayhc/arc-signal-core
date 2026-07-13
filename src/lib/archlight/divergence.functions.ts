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

// ============ D2b: narrative framing analysis ============

const analyseInput = z.object({ eventId: z.string().uuid() });

type Framing = {
  domain: string;
  outlet_name: string | null;
  lean: string | null;
  lean_label: string | null;
  angle: string;
  emphasises: string;
  downplays: string;
  framing: string;
};

export type AnalyseDivergenceResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      eventId: string;
      n_outlets: number;
      n_with_lean: number;
      distinct_lean_zones: number;
      baseline: string;
      framings: Framing[];
      divergence_score: number | null;
      divergence_label: string | null;
    };

function stripIfUnsafe(text: string): string {
  const g = guardFinancialAdvice(text ?? "");
  return g.ok ? (text ?? "") : "";
}

export const analyseNarrativeDivergence = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: unknown) => analyseInput.parse(input))
  .handler(async ({ data }): Promise<AnalyseDivergenceResult> => {
    const db = await admin();
    const eventId = data.eventId;

    // Fetch event
    const { data: evt } = await db
      .from("event_candidates")
      .select("id, title, summary")
      .eq("id", eventId)
      .maybeSingle();
    if (!evt) return { skipped: true, reason: "event_not_found" };

    // Event → atomic ids via company_impacts.evidence_ids
    const { data: impacts } = await db
      .from("company_impacts")
      .select("evidence_ids")
      .eq("event_candidate_id", eventId);
    const atomicIds = Array.from(new Set(
      (impacts ?? []).flatMap((i) => (i.evidence_ids ?? []) as string[]),
    ));
    if (atomicIds.length === 0) return { skipped: true, reason: "no_atomic_claims" };

    // atomic_claims → (document_id, source_id, canonical_claim_id)
    const atomicRows: Array<{ id: string; document_id: string | null; source_id: string | null; canonical_claim_id: string | null }> = [];
    for (let i = 0; i < atomicIds.length; i += 500) {
      const chunk = atomicIds.slice(i, i + 500);
      const { data: rows } = await db
        .from("atomic_claims")
        .select("id, document_id, source_id, canonical_claim_id")
        .in("id", chunk);
      for (const r of rows ?? []) atomicRows.push(r);
    }

    // Filter to independent lineage (matches D1b logic)
    const canonicalIds = Array.from(new Set(atomicRows.map((a) => a.canonical_claim_id).filter((x): x is string => !!x)));
    const independentPairs = new Set<string>(); // `${canonical}::${source}`
    for (let i = 0; i < canonicalIds.length; i += 500) {
      const chunk = canonicalIds.slice(i, i + 500);
      const { data: lineage } = await db
        .from("claim_lineage")
        .select("canonical_claim_id, source_id, is_likely_copy, relation_to_origin")
        .in("canonical_claim_id", chunk)
        .eq("is_likely_copy", false)
        .in("relation_to_origin", ["origin_candidate", "independent_support"]);
      for (const l of lineage ?? []) {
        if (l.source_id) independentPairs.add(`${l.canonical_claim_id}::${l.source_id}`);
      }
    }

    // Keep only atomic rows whose (canonical, source) is independent, and that have a document
    const keptAtomics = atomicRows.filter(
      (a) => a.document_id && a.source_id && a.canonical_claim_id &&
        independentPairs.has(`${a.canonical_claim_id}::${a.source_id}`),
    );
    if (keptAtomics.length === 0) return { skipped: true, reason: "no_independent_lineage" };

    // Load sources → independence_group
    const sourceIds = Array.from(new Set(keptAtomics.map((a) => a.source_id!) as string[]));
    const sourceIdToGroup = new Map<string, string>();
    const groupToName = new Map<string, string | null>();
    for (let i = 0; i < sourceIds.length; i += 500) {
      const chunk = sourceIds.slice(i, i + 500);
      const { data: sources } = await db
        .from("sources")
        .select("id, name, independence_group, base_url, feed_url, is_synthetic")
        .in("id", chunk);
      for (const s of sources ?? []) {
        const g = (s.independence_group && s.independence_group.trim())
          ? s.independence_group
          : deriveIndependenceGroup(s.base_url ?? s.feed_url, s.name, !!s.is_synthetic, s.id);
        sourceIdToGroup.set(s.id, g);
        if (!groupToName.has(g)) groupToName.set(g, s.name ?? null);
      }
    }

    // Load documents (full_text or body)
    const docIds = Array.from(new Set(keptAtomics.map((a) => a.document_id!) as string[]));
    const docTextById = new Map<string, string>();
    for (let i = 0; i < docIds.length; i += 200) {
      const chunk = docIds.slice(i, i + 200);
      const { data: docs } = await db
        .from("documents")
        .select("id, full_text, body")
        .in("id", chunk);
      for (const d of docs ?? []) {
        const t = (d.full_text && d.full_text.trim()) ? d.full_text : (d.body ?? "");
        if (t && t.trim()) docTextById.set(d.id, t);
      }
    }

    // Group text per independence_group
    const groupText = new Map<string, string[]>();
    for (const a of keptAtomics) {
      const g = sourceIdToGroup.get(a.source_id!);
      const t = docTextById.get(a.document_id!);
      if (!g || !t) continue;
      const arr = groupText.get(g) ?? [];
      arr.push(t);
      groupText.set(g, arr);
    }

    // One blob per outlet, truncated
    const outletBlobs: Array<{ domain: string; text: string }> = [];
    for (const [g, texts] of groupText) {
      const joined = texts.join("\n\n").slice(0, 1500);
      if (joined.trim()) outletBlobs.push({ domain: g, text: joined });
    }
    if (outletBlobs.length < 2) return { skipped: true, reason: "insufficient_outlet_text" };

    // Load lean for these domains
    const domains = outletBlobs.map((b) => b.domain.toLowerCase());
    const { data: leans } = await db
      .from("source_lean")
      .select("domain, outlet_name, lean, lean_label")
      .in("domain", domains);
    const leanByDomain = new Map<string, { outlet_name: string | null; lean: string | null; lean_label: string | null }>();
    for (const l of leans ?? []) {
      leanByDomain.set(l.domain.toLowerCase(), {
        outlet_name: l.outlet_name ?? null,
        lean: l.lean ?? null,
        lean_label: l.lean_label ?? null,
      });
    }

    const outletInputs = outletBlobs.map((b) => {
      const lean = leanByDomain.get(b.domain.toLowerCase()) ?? null;
      return {
        domain: b.domain,
        outlet_name: lean?.outlet_name ?? groupToName.get(b.domain) ?? null,
        lean: lean?.lean ?? null,
        lean_label: lean?.lean_label ?? null,
        text: b.text,
      };
    });

    // One AI call
    const userBlocks = outletInputs.map((o, i) =>
      `--- OUTLET ${i + 1} ---\noutlet_name: ${o.outlet_name ?? "unknown"}\ndomain: ${o.domain}\nlean: ${o.lean_label ?? o.lean ?? "unrated"}\ntext:\n${o.text}\n`,
    ).join("\n");

    const ai = await callJson<{
      baseline?: string;
      framings?: Array<{ domain?: string; outlet_name?: string; angle?: string; emphasises?: string; downplays?: string; framing?: string }>;
      divergence_score?: number;
    }>({
      task: "narrative_framing",
      system:
        "You compare how different outlets FRAME the same story — what each emphasises, downplays " +
        "or omits — NOT which is true. Paraphrase; never quote more than a few words verbatim. Only " +
        "characterise what is present in the provided text; never invent an outlet's stance. Use " +
        "hedged language. NEVER give financial advice (no buy/sell/hold/target price).",
      user:
        `EVENT TITLE: ${evt.title ?? ""}\nEVENT SUMMARY: ${evt.summary ?? ""}\n\n` +
        `${userBlocks}\n\n` +
        `Also assess divergence_score: an integer 0..100 for how far apart the outlets' framings are ` +
        `on CAUSE, BLAME and CONSEQUENCE (0 = essentially the same story; 100 = flatly contradictory). ` +
        `Ground it ONLY in the provided framings/texts — no outside knowledge.\n\n` +
        `Return STRICT JSON: {"baseline": string, "framings": [{"domain": string, "outlet_name": string, "angle": string, "emphasises": string, "downplays": string, "framing": string}], "divergence_score": number}`,
      temperature: 0.2,
      maxTokens: 2048,
    });

    if (!ai.ok || !ai.data) return { skipped: true, reason: ai.error ?? "ai_failed" };

    const baseline = stripIfUnsafe(String(ai.data.baseline ?? "").trim());
    const rawFramings = Array.isArray(ai.data.framings) ? ai.data.framings : [];
    const byDomain = new Map<string, (typeof outletInputs)[number]>();
    for (const o of outletInputs) byDomain.set(o.domain.toLowerCase(), o);

    const framings: Framing[] = [];
    for (const f of rawFramings) {
      const dom = String(f.domain ?? "").toLowerCase();
      const meta = byDomain.get(dom);
      if (!meta) continue;
      const framingText = stripIfUnsafe(String(f.framing ?? ""));
      if (!framingText) continue;
      framings.push({
        domain: meta.domain,
        outlet_name: f.outlet_name ?? meta.outlet_name,
        lean: meta.lean,
        lean_label: meta.lean_label,
        angle: String(f.angle ?? "").slice(0, 200),
        emphasises: String(f.emphasises ?? "").slice(0, 500),
        downplays: String(f.downplays ?? "").slice(0, 500),
        framing: framingText.slice(0, 800),
      });
    }

    if (framings.length < 2) return { skipped: true, reason: "no_usable_framings" };

    const n_outlets = outletInputs.length;
    const n_with_lean = outletInputs.filter((o) => o.lean).length;
    const distinct_lean_zones = new Set(outletInputs.map((o) => o.lean).filter((x): x is string => !!x)).size;

    const rawScore = Number(ai.data.divergence_score);
    const divergence_score: number | null = Number.isFinite(rawScore)
      ? Math.max(0, Math.min(100, Math.round(rawScore)))
      : null;
    const divergence_label: string | null = divergence_score === null
      ? null
      : divergence_score <= 33 ? "Aligned"
      : divergence_score <= 66 ? "Mixed"
      : "Sharply divergent";

    await db.from("narrative_divergence").upsert({
      event_candidate_id: eventId,
      baseline,
      outlet_framings: framings,
      n_outlets,
      n_with_lean,
      distinct_lean_zones,
      divergence_score,
      divergence_label,
      model: pickModel("narrative_framing"),
      computed_at: new Date().toISOString(),
    }, { onConflict: "event_candidate_id" });

    return { skipped: false, eventId, n_outlets, n_with_lean, distinct_lean_zones, baseline, framings, divergence_score, divergence_label };
  });

const autoInput = z.object({ limit: z.number().int().min(1).max(20).optional() });

export const autoAnalyseTopConvergence = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: unknown) => autoInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<{ analysed: number; skipped: number }> => {
    const limit = data.limit ?? 5;
    const db = await admin();

    // Get top convergence candidates
    const events = await getConvergenceEvents({ data: { minOutlets: 2, days: 30, limit: 50 } });
    if (events.length === 0) return { analysed: 0, skipped: 0 };

    const ids = events.map((e) => e.id);
    const { data: existing } = await db
      .from("narrative_divergence")
      .select("event_candidate_id, computed_at")
      .in("event_candidate_id", ids);
    const staleMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const fresh = new Set<string>();
    for (const r of existing ?? []) {
      if (r.computed_at && (now - new Date(r.computed_at).getTime()) < staleMs) {
        fresh.add(r.event_candidate_id);
      }
    }

    let analysed = 0;
    let skipped = 0;
    for (const e of events) {
      if (analysed >= limit) break;
      if (fresh.has(e.id)) continue;
      const res = await analyseNarrativeDivergence({ data: { eventId: e.id } });
      if ((res as { skipped: boolean }).skipped) skipped++;
      else analysed++;
    }
    return { analysed, skipped };
  });

