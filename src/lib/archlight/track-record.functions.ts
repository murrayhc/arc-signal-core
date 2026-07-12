// Verified track record — computed only from resolved outcome_predictions.
// Hard data, no LLM. Public read via track_record_snapshots.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const COIN_FLIP_BRIER = 0.25;

export interface CalibrationBucket {
  lo: number;
  hi: number;
  n: number;
  mean_predicted: number;
  observed_rate: number;
}

export interface TrackRecord {
  // Event-level
  open_count: number;
  pending_review_count: number;
  resolved_count: number;
  graded_count: number;
  happened_count: number;
  base_rate: number | null;
  mean_brier_first: number | null;
  mean_brier_final: number | null;
  coin_flip_brier: number;
  calibration: CalibrationBucket[];
  mean_lead_time_days: number | null;
  median_lead_time_days: number | null;
  lead_time_n: number;
  before_mainstream_count: number;
  // Scenario-level
  scenario_count: number;
  scenario_mean_brier: number | null;
  by_horizon: Record<string, { n: number; happened: number }>;
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = nums.reduce((a, b) => a + b, 0);
  return Number((s / nums.length).toFixed(6));
}

async function computeCore(): Promise<TrackRecord> {
  const db = await admin();
  const { data: rows } = await db
    .from("outcome_predictions")
    .select(
      "subject_kind, status, outcome, predicted_probability, brier_first, brier_final, lead_time_days, before_mainstream, horizon",
    );

  const all = rows ?? [];
  const events = all.filter((r) => r.subject_kind === "event");
  const scenarios = all.filter((r) => r.subject_kind === "scenario");

  const open_count = events.filter((r) => r.status === "open").length;
  const pending_review_count = events.filter((r) => r.status === "pending_review").length;
  const resolved_count = events.filter((r) => r.status === "resolved").length;
  const graded = events.filter((r) => r.status === "resolved" && r.outcome && r.outcome !== "unresolvable");
  const graded_count = graded.length;
  const happened_count = graded.filter((r) => r.outcome === "happened").length;
  const base_rate = graded_count > 0 ? Number((happened_count / graded_count).toFixed(4)) : null;

  const mean_brier_first = mean(
    graded.map((r) => Number(r.brier_first)).filter((n) => Number.isFinite(n)),
  );
  const mean_brier_final = mean(
    graded.map((r) => Number(r.brier_final)).filter((n) => Number.isFinite(n)),
  );

  // 10-decile calibration over graded event rows.
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < 10; i++) {
    const lo = i / 10;
    const hi = i === 9 ? 1.0001 : (i + 1) / 10;
    const inBucket = graded.filter((r) => {
      const p = Number(r.predicted_probability);
      return Number.isFinite(p) && p >= lo && p < hi;
    });
    const n = inBucket.length;
    const mean_predicted = n ? Number((inBucket.reduce((a, r) => a + Number(r.predicted_probability), 0) / n).toFixed(4)) : 0;
    const observed_rate = n ? Number((inBucket.filter((r) => r.outcome === "happened").length / n).toFixed(4)) : 0;
    buckets.push({ lo, hi: i === 9 ? 1.0 : hi, n, mean_predicted, observed_rate });
  }

  const leadTimes = graded
    .filter((r) => r.outcome === "happened" && r.lead_time_days != null)
    .map((r) => Number(r.lead_time_days))
    .filter((n) => Number.isFinite(n));
  const mean_lead_time_days = leadTimes.length ? Number((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(2)) : null;
  const sortedLead = [...leadTimes].sort((a, b) => a - b);
  const median_lead_time_days = sortedLead.length
    ? Number(
        (
          sortedLead.length % 2
            ? sortedLead[(sortedLead.length - 1) / 2]
            : (sortedLead[sortedLead.length / 2 - 1] + sortedLead[sortedLead.length / 2]) / 2
        ).toFixed(2),
      )
    : null;
  const before_mainstream_count = graded.filter(
    (r) => r.outcome === "happened" && (r as { before_mainstream?: boolean }).before_mainstream === true,
  ).length;

  const scenariosResolved = scenarios.filter((r) => r.status === "resolved" && r.outcome && r.outcome !== "unresolvable");
  const scenario_count = scenariosResolved.length;
  const scenario_mean_brier = mean(
    scenariosResolved.map((r) => Number(r.brier_first)).filter((n) => Number.isFinite(n)),
  );
  const by_horizon: Record<string, { n: number; happened: number }> = {};
  for (const s of scenariosResolved) {
    const h = s.horizon ?? "unknown";
    if (!by_horizon[h]) by_horizon[h] = { n: 0, happened: 0 };
    by_horizon[h].n++;
    if (s.outcome === "happened") by_horizon[h].happened++;
  }

  return {
    open_count,
    pending_review_count,
    resolved_count,
    graded_count,
    happened_count,
    base_rate,
    mean_brier_first,
    mean_brier_final,
    coin_flip_brier: COIN_FLIP_BRIER,
    calibration: buckets,
    mean_lead_time_days,
    median_lead_time_days,
    lead_time_n: leadTimes.length,
    before_mainstream_count,
    scenario_count,
    scenario_mean_brier,
    by_horizon,
  };
}

export const computeTrackRecord = createServerFn({ method: "GET" }).handler(async () => {
  return computeCore();
});

export const writeTrackRecordSnapshot = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => z.object({ scanRunId: z.string().uuid() }).parse(d))
  .handler(async ({ data }: { data: { scanRunId: string } }) => {
    const db = await admin();
    const tr = await computeCore();
    const { error } = await db.from("track_record_snapshots").insert({
      scan_run_id: data.scanRunId,
      resolved_count: tr.resolved_count,
      happened_count: tr.happened_count,
      pending_review_count: tr.pending_review_count,
      open_count: tr.open_count,
      graded_count: tr.graded_count,
      mean_brier_first: tr.mean_brier_first,
      mean_brier_final: tr.mean_brier_final,
      base_rate: tr.base_rate,
      calibration: JSON.parse(JSON.stringify(tr.calibration)),
      mean_lead_time_days: tr.mean_lead_time_days,
      scenario_count: tr.scenario_count,
      scenario_mean_brier: tr.scenario_mean_brier,
      by_horizon: JSON.parse(JSON.stringify(tr.by_horizon)),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recentResolutions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(100).optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const limit = data?.limit ?? 20;
    const { data: rows } = await db
      .from("outcome_predictions")
      .select(
        "id, prediction_text, subject_kind, outcome, observed_path, resolved_by, resolved_at, brier_first, lead_time_days, resolution_rationale, event_candidate_id, horizon",
      )
      .eq("status", "resolved")
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(limit);
    return { resolutions: rows ?? [] };
  });

export const recentTrackRecordSnapshots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().min(1).max(90).optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const limit = data?.limit ?? 30;
    const { data: rows } = await db
      .from("track_record_snapshots")
      .select("id, created_at, scan_run_id, resolved_count, happened_count, pending_review_count, open_count, graded_count, mean_brier_first, mean_brier_final, base_rate, mean_lead_time_days")
      .order("created_at", { ascending: false })
      .limit(limit);
    return { snapshots: rows ?? [] };
  });
