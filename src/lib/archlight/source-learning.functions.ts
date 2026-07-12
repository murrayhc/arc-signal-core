// Owner-gated source-accuracy learning.
// After outcomes resolve, measure how each SOURCE's supported events actually
// panned out, and SUGGEST nudging that source's reliability_score. Nothing
// changes automatically — the owner applies with a click.

import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "@/lib/archlight/owner-auth.server";
import { z } from "zod";
import { guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const MIN_RESOLVED_PER_SOURCE = 10;
export const MIN_GAP = 0.1;
export const MAX_STEP = 0.05;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function safeRationale(s: string): string {
  const g = guardFinancialAdvice(s);
  if (!g.ok) return `Reliability adjustment computed on ${new Date().toISOString().slice(0, 10)}.`;
  return s.slice(0, 900);
}

interface Aggregate {
  source_id: string;
  claims_seen: number;
  claims_confirmed: number;
  claims_contested: number;
  accuracy_score: number;
  earliest_resolved_at: string | null;
}

async function computeAggregates(
  db: Awaited<ReturnType<typeof admin>>,
): Promise<Map<string, Aggregate>> {
  // 1. Resolved event predictions with a happened/did_not_happen outcome.
  const { data: preds } = await db
    .from("outcome_predictions")
    .select("id, event_candidate_id, outcome, resolved_at, evidence_canonical_ids")
    .eq("subject_kind", "event")
    .eq("status", "resolved")
    .in("outcome", ["happened", "did_not_happen"]);
  const predRows = preds ?? [];
  if (predRows.length === 0) return new Map();

  // 2. Load lineage rows for all canonical ids referenced, excluding contradictions.
  const canonicalIds = Array.from(
    new Set(predRows.flatMap((p) => (p.evidence_canonical_ids ?? []) as string[])),
  );
  if (canonicalIds.length === 0) return new Map();

  const lineageBySource = new Map<string, Set<string>>(); // canonicalId -> Set of source_ids
  const CHUNK = 500;
  for (let i = 0; i < canonicalIds.length; i += CHUNK) {
    const slice = canonicalIds.slice(i, i + CHUNK);
    const { data: lineage } = await db
      .from("claim_lineage")
      .select("canonical_claim_id, source_id, relation_to_origin")
      .in("canonical_claim_id", slice)
      .neq("relation_to_origin", "contradiction");
    for (const l of lineage ?? []) {
      if (!l.source_id || !l.canonical_claim_id) continue;
      if (!lineageBySource.has(l.canonical_claim_id)) {
        lineageBySource.set(l.canonical_claim_id, new Set());
      }
      lineageBySource.get(l.canonical_claim_id)!.add(String(l.source_id));
    }
  }

  // 3. Roll up per source: distinct event predictions supported.
  type Bucket = { confirmed: Set<string>; contested: Set<string>; earliest: string | null };
  const perSource = new Map<string, Bucket>();
  for (const p of predRows) {
    const sourceSet = new Set<string>();
    for (const cid of (p.evidence_canonical_ids ?? []) as string[]) {
      const supporters = lineageBySource.get(cid);
      if (!supporters) continue;
      supporters.forEach((s) => sourceSet.add(s));
    }
    for (const sid of sourceSet) {
      if (!perSource.has(sid)) perSource.set(sid, { confirmed: new Set(), contested: new Set(), earliest: null });
      const b = perSource.get(sid)!;
      if (p.outcome === "happened") b.confirmed.add(p.id);
      else b.contested.add(p.id);
      if (p.resolved_at) {
        if (!b.earliest || p.resolved_at < b.earliest) b.earliest = p.resolved_at;
      }
    }
  }

  const out = new Map<string, Aggregate>();
  for (const [sid, b] of perSource) {
    // A prediction is counted once per source; if a source both supported and later
    // was on a "did not happen" side, prefer the happened side (already exclusive per
    // prediction id above — a prediction is only 'happened' or 'did_not_happen').
    const seen = b.confirmed.size + b.contested.size;
    if (seen === 0) continue;
    const accuracy = b.confirmed.size / seen;
    out.set(sid, {
      source_id: sid,
      claims_seen: seen,
      claims_confirmed: b.confirmed.size,
      claims_contested: b.contested.size,
      accuracy_score: Number(accuracy.toFixed(4)),
      earliest_resolved_at: b.earliest,
    });
  }
  return out;
}

export const computeSourceAccuracy = createServerFn({ method: "POST" }).middleware([requireOwner]).handler(async () => {
  const db = await admin();
  const aggs = await computeAggregates(db);
  if (aggs.size === 0) return { suggestions_upserted: 0, aggregates_computed: 0 };

  const sourceIds = Array.from(aggs.keys());
  const { data: sources } = await db
    .from("sources")
    .select("id, name, reliability_score")
    .in("id", sourceIds);
  const srcMap = new Map((sources ?? []).map((s) => [s.id, s] as const));

  let upserts = 0;
  for (const a of aggs.values()) {
    if (a.claims_seen < MIN_RESOLVED_PER_SOURCE) continue;
    const src = srcMap.get(a.source_id);
    if (!src) continue;
    const current = clamp01(Number(src.reliability_score));
    const gap = a.accuracy_score - current;
    if (Math.abs(gap) < MIN_GAP) continue;
    const direction = gap > 0 ? 1 : -1;
    const step = Math.min(MAX_STEP, Math.abs(gap));
    const suggested = Number(clamp01(current + direction * step).toFixed(4));
    if (Math.abs(suggested - current) < 0.0005) continue;

    const rationale = safeRationale(
      `Supported ${a.claims_seen} resolved events; ${a.claims_confirmed} materialised (accuracy ${Math.round(a.accuracy_score * 100)}%). Reliability ${current.toFixed(2)} → suggested ${suggested.toFixed(2)}.`,
    );

    // Close any prior open suggestion for this source (rare — partial unique
    // index enforces one open row), then insert the new one.
    const { data: existing } = await db
      .from("source_reliability_suggestions")
      .select("id")
      .eq("source_id", a.source_id)
      .eq("status", "suggested")
      .maybeSingle();
    if (existing) {
      const { error } = await db
        .from("source_reliability_suggestions")
        .update({
          current_score: current,
          suggested_score: suggested,
          accuracy_score: a.accuracy_score,
          claims_seen: a.claims_seen,
          claims_confirmed: a.claims_confirmed,
          claims_contested: a.claims_contested,
          rationale,
        })
        .eq("id", existing.id);
      if (!error) upserts++;
    } else {
      const { error } = await db.from("source_reliability_suggestions").insert({
        source_id: a.source_id,
        current_score: current,
        suggested_score: suggested,
        accuracy_score: a.accuracy_score,
        claims_seen: a.claims_seen,
        claims_confirmed: a.claims_confirmed,
        claims_contested: a.claims_contested,
        rationale,
      });
      if (!error) upserts++;
    }
  }
  return { suggestions_upserted: upserts, aggregates_computed: aggs.size };
});

export const listSourceSuggestions = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: sugg } = await db
    .from("source_reliability_suggestions")
    .select("*")
    .eq("status", "suggested")
    .order("created_at", { ascending: false });
  const rows = sugg ?? [];
  if (rows.length === 0) return { suggestions: [] };
  const { data: sources } = await db
    .from("sources")
    .select("id, name, reliability_score, source_type")
    .in("id", rows.map((r) => r.source_id));
  const srcMap = new Map((sources ?? []).map((s) => [s.id, s] as const));
  return {
    suggestions: rows.map((r) => {
      const s = srcMap.get(r.source_id);
      return {
        ...r,
        source_name: s?.name ?? "(unknown source)",
        source_type: s?.source_type ?? null,
        live_reliability_score: s ? Number(s.reliability_score) : null,
      };
    }),
  };
});

export const applySourceSuggestion = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }: { data: { id: string } }) => {
    const db = await admin();
    const { data: sugg } = await db
      .from("source_reliability_suggestions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!sugg) throw new Error("Suggestion not found");
    if (sugg.status !== "suggested") throw new Error(`Suggestion already ${sugg.status}`);

    const now = new Date().toISOString();
    const suggested = Number(sugg.suggested_score);

    // 1. Update source reliability.
    const { error: uErr } = await db
      .from("sources")
      .update({ reliability_score: suggested })
      .eq("id", sugg.source_id);
    if (uErr) throw new Error(uErr.message);

    // 2. Mark suggestion applied.
    await db
      .from("source_reliability_suggestions")
      .update({ status: "applied", applied_at: now })
      .eq("id", sugg.id);

    // 3. Determine window_start: earliest resolved event this source supported.
    let windowStart: string | null = null;
    const { data: preds } = await db
      .from("outcome_predictions")
      .select("resolved_at, evidence_canonical_ids")
      .eq("subject_kind", "event")
      .eq("status", "resolved")
      .in("outcome", ["happened", "did_not_happen"]);
    const predRows = preds ?? [];
    if (predRows.length) {
      const canonicalIds = Array.from(
        new Set(predRows.flatMap((p) => (p.evidence_canonical_ids ?? []) as string[])),
      );
      const ownedCanonical = new Set<string>();
      if (canonicalIds.length) {
        const CHUNK = 500;
        for (let i = 0; i < canonicalIds.length; i += CHUNK) {
          const slice = canonicalIds.slice(i, i + CHUNK);
          const { data: lineage } = await db
            .from("claim_lineage")
            .select("canonical_claim_id, source_id, relation_to_origin")
            .in("canonical_claim_id", slice)
            .eq("source_id", sugg.source_id)
            .neq("relation_to_origin", "contradiction");
          for (const l of lineage ?? []) if (l.canonical_claim_id) ownedCanonical.add(l.canonical_claim_id);
        }
      }
      for (const p of predRows) {
        const hit = ((p.evidence_canonical_ids ?? []) as string[]).some((c) => ownedCanonical.has(c));
        if (hit && p.resolved_at) {
          if (!windowStart || p.resolved_at < windowStart) windowStart = p.resolved_at;
        }
      }
    }

    // 4. Write history row.
    await db.from("source_reliability_history").insert({
      source_id: sugg.source_id,
      accuracy_score: Number(sugg.accuracy_score),
      claims_confirmed: sugg.claims_confirmed,
      claims_contested: sugg.claims_contested,
      claims_seen: sugg.claims_seen,
      claims_retracted: 0,
      copy_loop_rate: 0,
      originality_rate: 0,
      window_start: windowStart ?? now,
      window_end: now,
    });

    return { ok: true, applied_score: suggested };
  });

export const dismissSourceSuggestion = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }: { data: { id: string } }) => {
    const db = await admin();
    const { error } = await db
      .from("source_reliability_suggestions")
      .update({ status: "dismissed" })
      .eq("id", data.id)
      .eq("status", "suggested");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
