// Brier-scored reviewer scorecard.
// Every human decision is recorded as a hard prediction (confidence=1.0).
// Verdicts are graded ONLY where a genuinely independent resolution exists.
// Below n_graded < 10 the reviewer's weight stays neutral (1.0) — honest
// accruing gate. Never auto-blocks; surface only.

import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "@/lib/archlight/owner-auth.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DbAdmin = SupabaseClient<Database>;

async function admin(): Promise<DbAdmin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface RecordVerdictInput {
  reviewer?: string;
  reviewItemId?: string | null;
  itemType: string;                 // e.g. 'prediction_resolution', 'contested_assessment'
  subjectKind: string;              // e.g. 'prediction', 'event', 'canonical'
  subjectId: string;                // FK to whichever subject table
  verdict: string;                  // human-readable verdict token
}

// Fire-and-forget helper for decision paths. Never throws.
export async function recordReviewerVerdict(input: RecordVerdictInput): Promise<void> {
  try {
    const db = await admin();
    await db.from("reviewer_verdicts").insert({
      reviewer: (input.reviewer ?? "owner").slice(0, 120),
      review_item_id: input.reviewItemId ?? null,
      item_type: input.itemType.slice(0, 80),
      subject_kind: input.subjectKind.slice(0, 40),
      subject_id: input.subjectId.slice(0, 120),
      verdict: input.verdict.slice(0, 80),
    });
  } catch {
    // never fail a decision because attribution failed
  }
}

// ---------- Grading ----------

type Outcome = "correct" | "incorrect" | "unresolvable";

function brier(hit: 0 | 1): number {
  // Hard verdict → confidence 1 in the direction. brier = (1 - hit)^2.
  return (1 - hit) * (1 - hit);
}

interface GradeStats {
  scanned: number;
  graded: number;
  still_open: number;
  notes: string[];
}

async function gradePredictionResolution(db: DbAdmin, rows: VerdictRow[]): Promise<{ updates: PendingUpdate[]; stillOpen: number }> {
  const updates: PendingUpdate[] = [];
  let stillOpen = 0;
  const ids = rows.map((r) => r.subject_id).filter(Boolean);
  if (ids.length === 0) return { updates, stillOpen };
  const { data: preds } = await db
    .from("outcome_predictions")
    .select("id, status, outcome, resolved_by")
    .in("id", ids as string[]);
  const predById = new Map<string, { status: string | null; outcome: string | null; resolved_by: string | null }>();
  for (const p of preds ?? []) predById.set(p.id, { status: p.status ?? null, outcome: p.outcome ?? null, resolved_by: p.resolved_by ?? null });
  for (const r of rows) {
    const p = predById.get(r.subject_id ?? "");
    if (!p || p.status !== "resolved") { stillOpen++; continue; }
    // Independent truth only: skip if the prediction was resolved BY this same review path.
    if (p.resolved_by === "review") { stillOpen++; continue; }
    if (r.verdict === "unresolvable" || p.outcome === "unresolvable") {
      updates.push({ id: r.id, outcome: "unresolvable", brier: null });
      continue;
    }
    if (!p.outcome) { stillOpen++; continue; }
    const hit: 0 | 1 = r.verdict === p.outcome ? 1 : 0;
    updates.push({ id: r.id, outcome: hit ? "correct" : "incorrect", brier: brier(hit) });
  }
  return { updates, stillOpen };
}

async function gradeCanonicalDecision(db: DbAdmin, rows: VerdictRow[]): Promise<{ updates: PendingUpdate[]; stillOpen: number }> {
  // For approve/reject on canonical claims: correct if later corroboration
  // matches. approve → correct when reliability high + no strong contradiction;
  // reject → correct when contradiction_count high.
  const updates: PendingUpdate[] = [];
  let stillOpen = 0;
  const ids = rows.map((r) => r.subject_id).filter(Boolean);
  if (ids.length === 0) return { updates, stillOpen };
  const { data: cans } = await db
    .from("canonical_claims")
    .select("id, reliability_score, contradiction_count, repeat_count")
    .in("id", ids as string[]);
  const byId = new Map<string, { reliability_score: number | null; contradiction_count: number | null; repeat_count: number | null }>();
  for (const c of cans ?? []) byId.set(c.id, { reliability_score: c.reliability_score, contradiction_count: c.contradiction_count, repeat_count: c.repeat_count });
  for (const r of rows) {
    const c = byId.get(r.subject_id ?? "");
    if (!c) { stillOpen++; continue; }
    const reliability = Number(c.reliability_score ?? 0);
    const contradictions = Number(c.contradiction_count ?? 0);
    const repeats = Number(c.repeat_count ?? 0);
    const strongly_corroborated = reliability >= 0.7 && repeats >= 3 && contradictions === 0;
    const strongly_contradicted = contradictions >= 2;
    if (!strongly_corroborated && !strongly_contradicted) { stillOpen++; continue; }
    if (r.verdict === "approve" || r.verdict === "approved") {
      const hit: 0 | 1 = strongly_corroborated ? 1 : 0;
      updates.push({ id: r.id, outcome: hit ? "correct" : "incorrect", brier: brier(hit) });
    } else if (r.verdict === "reject" || r.verdict === "rejected") {
      const hit: 0 | 1 = strongly_contradicted ? 1 : 0;
      updates.push({ id: r.id, outcome: hit ? "correct" : "incorrect", brier: brier(hit) });
    } else {
      stillOpen++;
    }
  }
  return { updates, stillOpen };
}

async function gradeEventVerdict(db: DbAdmin, rows: VerdictRow[]): Promise<{ updates: PendingUpdate[]; stillOpen: number }> {
  // For contested_assessment / distress decisions tied to an event: correct if
  // the event's ledger receipt has since resolved and matches the verdict.
  const updates: PendingUpdate[] = [];
  let stillOpen = 0;
  const ids = rows.map((r) => r.subject_id).filter(Boolean);
  if (ids.length === 0) return { updates, stillOpen };
  const { data: preds } = await db
    .from("outcome_predictions")
    .select("event_candidate_id, subject_kind, status, outcome")
    .in("event_candidate_id", ids as string[])
    .eq("subject_kind", "event");
  const evOutcome = new Map<string, string | null>();
  for (const p of preds ?? []) {
    if (p.status === "resolved" && p.outcome) evOutcome.set(p.event_candidate_id, p.outcome);
  }
  for (const r of rows) {
    const outcome = evOutcome.get(r.subject_id ?? "");
    if (!outcome) { stillOpen++; continue; }
    if (outcome === "unresolvable") {
      updates.push({ id: r.id, outcome: "unresolvable", brier: null });
      continue;
    }
    // For contested_assessment: the "verdict" is typically flagging split.
    // Grade it as correct if the event ended up unresolvable/mixed (i.e. the
    // flag was warranted); as incorrect if it resolved cleanly.
    if (r.item_type === "contested_assessment") {
      const flag_was_warranted = outcome === "unresolvable" || outcome === "did_not_happen";
      const hit: 0 | 1 = flag_was_warranted ? 1 : 0;
      updates.push({ id: r.id, outcome: hit ? "correct" : "incorrect", brier: brier(hit) });
      continue;
    }
    // Generic: verdict token equals outcome token.
    const hit: 0 | 1 = r.verdict === outcome ? 1 : 0;
    updates.push({ id: r.id, outcome: hit ? "correct" : "incorrect", brier: brier(hit) });
  }
  return { updates, stillOpen };
}

interface VerdictRow {
  id: string;
  reviewer: string;
  item_type: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  verdict: string | null;
}

interface PendingUpdate {
  id: string;
  outcome: Outcome;
  brier: number | null;
}

export async function gradeReviewerVerdicts(): Promise<GradeStats> {
  const stats: GradeStats = { scanned: 0, graded: 0, still_open: 0, notes: [] };
  try {
    const db = await admin();
    const { data: rows, error } = await db
      .from("reviewer_verdicts")
      .select("id, reviewer, item_type, subject_kind, subject_id, verdict")
      .is("graded_at", null)
      .limit(500);
    if (error) { stats.notes.push(`reviewer_verdicts read failed: ${error.message}`); return stats; }
    const all = (rows ?? []) as VerdictRow[];
    stats.scanned = all.length;
    if (all.length === 0) { stats.notes.push("No ungraded reviewer verdicts."); return stats; }

    const byType = new Map<string, VerdictRow[]>();
    for (const r of all) {
      const key = r.item_type ?? "unknown";
      const arr = byType.get(key) ?? [];
      arr.push(r);
      byType.set(key, arr);
    }

    const updates: PendingUpdate[] = [];
    for (const [itemType, group] of byType.entries()) {
      let res: { updates: PendingUpdate[]; stillOpen: number } = { updates: [], stillOpen: group.length };
      if (itemType === "prediction_resolution") {
        res = await gradePredictionResolution(db, group);
      } else if (itemType === "quarantined_claim" || itemType === "canonical_claim" || itemType === "low_confidence_impact") {
        res = await gradeCanonicalDecision(db, group);
      } else if (itemType === "contested_assessment" || itemType === "belief_stress" || itemType === "distress") {
        res = await gradeEventVerdict(db, group);
      }
      updates.push(...res.updates);
      stats.still_open += res.stillOpen;
    }

    const nowIso = new Date().toISOString();
    for (const u of updates) {
      const { error: uErr } = await db.from("reviewer_verdicts").update({
        outcome: u.outcome,
        brier: u.brier,
        graded_at: nowIso,
      }).eq("id", u.id);
      if (!uErr) stats.graded++;
    }
    stats.notes.push(`Reviewer grading: scanned ${stats.scanned}, graded ${stats.graded}, still open ${stats.still_open}.`);
    return stats;
  } catch (err) {
    stats.notes.push(`Reviewer grading failed: ${err instanceof Error ? err.message : String(err)}`);
    return stats;
  }
}

// ---------- Scores ----------

export interface ReviewerScore {
  reviewer: string;
  n_graded: number;
  n_open: number;
  accuracy: number;                 // 0..1, resolvable-only (excludes unresolvable)
  mean_brier: number;               // 0..1
  weight: number;                   // 0.5..1.0
  accruing: boolean;                // n_graded < 10
}

export function deriveWeight(accuracy: number, n_graded: number): number {
  if (n_graded < 10) return 1.0;
  // Map accuracy [0..1] onto weight [0.5..1.0].
  const w = 0.5 + Math.max(0, Math.min(1, accuracy)) * 0.5;
  return Number(w.toFixed(3));
}

export const computeReviewerScores = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data: rows, error } = await db
    .from("reviewer_verdicts")
    .select("reviewer, outcome, brier, graded_at");
  if (error) throw new Error(error.message);
  const byReviewer = new Map<string, { n_graded: number; n_open: number; hits: number; resolvable: number; brier_sum: number; brier_n: number }>();
  for (const r of rows ?? []) {
    const key = r.reviewer ?? "owner";
    const bucket = byReviewer.get(key) ?? { n_graded: 0, n_open: 0, hits: 0, resolvable: 0, brier_sum: 0, brier_n: 0 };
    if (r.graded_at == null) {
      bucket.n_open++;
    } else {
      bucket.n_graded++;
      if (r.outcome === "correct") { bucket.hits++; bucket.resolvable++; }
      else if (r.outcome === "incorrect") { bucket.resolvable++; }
      if (r.brier != null) { bucket.brier_sum += Number(r.brier); bucket.brier_n++; }
    }
    byReviewer.set(key, bucket);
  }
  const scores: ReviewerScore[] = Array.from(byReviewer.entries()).map(([reviewer, b]) => {
    const accuracy = b.resolvable > 0 ? b.hits / b.resolvable : 0;
    const mean_brier = b.brier_n > 0 ? b.brier_sum / b.brier_n : 0;
    return {
      reviewer,
      n_graded: b.n_graded,
      n_open: b.n_open,
      accuracy: Number(accuracy.toFixed(3)),
      mean_brier: Number(mean_brier.toFixed(3)),
      weight: deriveWeight(accuracy, b.n_graded),
      accruing: b.n_graded < 10,
    };
  }).sort((a, b) => b.n_graded - a.n_graded);
  return { scores };
});

// Manual trigger.
export const gradeReviewerVerdictsNow = createServerFn({ method: "POST" }).middleware([requireOwner]).handler(async () => {
  return await gradeReviewerVerdicts();
});
