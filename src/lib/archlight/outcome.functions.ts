// Prediction ledger: immutable receipts per event + per scenario_projection.
// Frozen at creation. Only `final_probability` (and resolution fields) may
// change afterwards; the DB trigger enforces immutability of the rest.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const HORIZON_DAYS: Record<string, number> = {
  immediate: 7,
  near: 30,
  medium: 90,
  strategic: 365,
};

function safeText(s: string, fallback: string): string {
  const t = (s ?? "").toString().slice(0, 500);
  const guard = guardFinancialAdvice(t);
  if (!guard.ok) return fallback;
  return t;
}

function isoPlusDays(iso: string | Date, days: number): string {
  const base = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(base.getTime() + days * DAY_MS).toISOString();
}

interface FreezeInput { scanRunId: string }

export const freezePredictions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ scanRunId: z.string().uuid() }).parse(d))
  .handler(async ({ data }: { data: FreezeInput }) => {
    const db = await admin();
    let eventsFrozen = 0;
    let scenariosFrozen = 0;
    const skipped: string[] = [];

    // 1. Load events created in this scan run.
    const { data: events } = await db
      .from("event_candidates")
      .select("id, title, event_type, probability, time_window_end, first_detected_at")
      .eq("created_from_scan_run_id", data.scanRunId);

    const evList = events ?? [];
    if (evList.length === 0) return { events_frozen: 0, scenarios_frozen: 0, skipped };

    // 2. Which events already have an event-level receipt?
    const eventDedupeKeys = evList.map((e) => `${e.id}:event`);
    const { data: existingEventReceipts } = await db
      .from("outcome_predictions")
      .select("dedupe_key")
      .in("dedupe_key", eventDedupeKeys);
    const existingEventKeys = new Set((existingEventReceipts ?? []).map((r) => r.dedupe_key));

    for (const ev of evList) {
      const eventKey = `${ev.id}:event`;
      const needEvent = !existingEventKeys.has(eventKey);

      // Build evidence snapshot (event → company_impacts.evidence_ids → atomic_claims → canonical_claims → claim_lineage)
      const { data: impactRows } = await db
        .from("company_impacts")
        .select("evidence_ids")
        .eq("event_candidate_id", ev.id);
      const atomicIds = Array.from(
        new Set((impactRows ?? []).flatMap((r) => (r.evidence_ids ?? []) as string[]))
      ).slice(0, 200);

      let canonicalIds: string[] = [];
      let entityIds: string[] = [];
      let contradictionCount = 0;
      let groups = 0;
      let supportDays = 0;

      if (atomicIds.length) {
        const { data: atomics } = await db
          .from("atomic_claims")
          .select("canonical_claim_id, entities")
          .in("id", atomicIds);
        canonicalIds = Array.from(
          new Set((atomics ?? []).map((a) => a.canonical_claim_id).filter((x): x is string => !!x))
        );
        entityIds = Array.from(
          new Set(((atomics ?? []).flatMap((a) => (a.entities ?? []) as string[])))
        ).slice(0, 40);

        if (canonicalIds.length) {
          const [{ data: cans }, { data: lineage }] = await Promise.all([
            db.from("canonical_claims").select("contradiction_count").in("id", canonicalIds),
            db
              .from("claim_lineage")
              .select("source_id, published_at")
              .in("canonical_claim_id", canonicalIds),
          ]);
          contradictionCount = (cans ?? []).reduce(
            (a, c) => a + Number(c.contradiction_count ?? 0),
            0
          );
          const groupSet = new Set<string>();
          const daySet = new Set<string>();
          for (const l of lineage ?? []) {
            if (l.source_id) groupSet.add(String(l.source_id));
            if (l.published_at) {
              const d = new Date(l.published_at);
              if (!isNaN(d.getTime())) daySet.add(d.toISOString().slice(0, 10));
            }
          }
          groups = groupSet.size;
          supportDays = daySet.size;
        }
      }

      if (needEvent) {
        const deadline = ev.time_window_end
          ? isoPlusDays(ev.time_window_end, 7)
          : isoPlusDays(ev.first_detected_at ?? new Date().toISOString(), 90);
        const deadlineDate = new Date(deadline).toISOString().slice(0, 10);
        const title = (ev.title ?? "Untitled event").toString().slice(0, 240);
        const evType = (ev.event_type ?? "event").toString().slice(0, 80);
        const rawText = `Event "${title}" (${evType}) materialises by ${deadlineDate}`;
        const predictionText = safeText(rawText, `Event receipt frozen on ${new Date().toISOString().slice(0, 10)}.`);
        const prob = clamp01(ev.probability);
        const baseline = {
          groups,
          entity_ids: entityIds,
          contradiction_count: contradictionCount,
          support_days: supportDays,
          leading_indicators: [],
          contradicting_signals: [],
        };
        const { error } = await db.from("outcome_predictions").insert({
          subject_kind: "event",
          event_candidate_id: ev.id,
          scenario_projection_id: null,
          dedupe_key: eventKey,
          prediction_text: predictionText,
          predicted_probability: prob,
          final_probability: prob,
          deadline,
          horizon: null,
          evidence_canonical_ids: canonicalIds,
          baseline,
        });
        if (error) {
          if (!/duplicate/i.test(error.message)) skipped.push(`event ${ev.id}: ${error.message}`);
        } else {
          eventsFrozen++;
        }
      }

      // 3. Scenario receipts for this event.
      const { data: scenarios } = await db
        .from("scenario_projections")
        .select("id, horizon, scenario_label, probability, leading_indicators, contradicting_signals, created_at")
        .eq("event_candidate_id", ev.id);
      const scList = scenarios ?? [];
      if (scList.length === 0) continue;

      const scenarioKeys = scList.map((s) => `${s.id}:scenario`);
      const { data: existingScenarioReceipts } = await db
        .from("outcome_predictions")
        .select("dedupe_key")
        .in("dedupe_key", scenarioKeys);
      const existingScenarioKeys = new Set((existingScenarioReceipts ?? []).map((r) => r.dedupe_key));

      for (const sc of scList) {
        const key = `${sc.id}:scenario`;
        if (existingScenarioKeys.has(key)) continue;
        const days = HORIZON_DAYS[sc.horizon] ?? 90;
        const predictedAt = sc.created_at ?? new Date().toISOString();
        const deadline = isoPlusDays(predictedAt, days);
        const label = (sc.scenario_label ?? "scenario").toString().slice(0, 200);
        const title = (ev.title ?? "Event").toString().slice(0, 200);
        const rawText = `${title}: "${label}" (${sc.horizon})`;
        const predictionText = safeText(rawText, `Scenario receipt frozen on ${new Date().toISOString().slice(0, 10)}.`);
        const prob = clamp01(sc.probability);
        const baseline = {
          groups,
          entity_ids: entityIds,
          contradiction_count: contradictionCount,
          support_days: supportDays,
          leading_indicators: (sc.leading_indicators ?? []) as string[],
          contradicting_signals: (sc.contradicting_signals ?? []) as string[],
        };
        const { error } = await db.from("outcome_predictions").insert({
          subject_kind: "scenario",
          event_candidate_id: ev.id,
          scenario_projection_id: sc.id,
          dedupe_key: key,
          prediction_text: predictionText,
          predicted_probability: prob,
          final_probability: prob,
          deadline,
          horizon: sc.horizon,
          evidence_canonical_ids: canonicalIds,
          baseline,
        });
        if (error) {
          if (!/duplicate/i.test(error.message)) skipped.push(`scenario ${sc.id}: ${error.message}`);
        } else {
          scenariosFrozen++;
        }
      }
    }

    return { events_frozen: eventsFrozen, scenarios_frozen: scenariosFrozen, skipped };
  });

// Refresh `final_probability` for open receipts against the live
// event/scenario probability. Never touches `predicted_probability`.
export const refreshFinalProbabilities = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { data: open } = await db
    .from("outcome_predictions")
    .select("id, subject_kind, event_candidate_id, scenario_projection_id, final_probability")
    .eq("status", "open");
  const rows = open ?? [];
  if (rows.length === 0) return { refreshed: 0 };

  const eventIds = Array.from(
    new Set(rows.filter((r) => r.subject_kind === "event").map((r) => r.event_candidate_id))
  );
  const scenarioIds = Array.from(
    new Set(
      rows
        .filter((r) => r.subject_kind === "scenario" && r.scenario_projection_id)
        .map((r) => r.scenario_projection_id as string)
    )
  );
  const [evRes, scRes] = await Promise.all([
    eventIds.length
      ? db.from("event_candidates").select("id, probability").in("id", eventIds)
      : Promise.resolve({ data: [] as Array<{ id: string; probability: number }> }),
    scenarioIds.length
      ? db.from("scenario_projections").select("id, probability").in("id", scenarioIds)
      : Promise.resolve({ data: [] as Array<{ id: string; probability: number }> }),
  ]);
  const evMap = new Map((evRes.data ?? []).map((e) => [e.id, Number(e.probability)] as const));
  const scMap = new Map((scRes.data ?? []).map((s) => [s.id, Number(s.probability)] as const));

  let refreshed = 0;
  for (const r of rows) {
    const live =
      r.subject_kind === "event"
        ? evMap.get(r.event_candidate_id)
        : r.scenario_projection_id
          ? scMap.get(r.scenario_projection_id)
          : undefined;
    if (live == null || !Number.isFinite(live)) continue;
    const next = clamp01(live);
    if (Math.abs(next - Number(r.final_probability)) < 0.0005) continue;
    const { error } = await db
      .from("outcome_predictions")
      .update({ final_probability: next })
      .eq("id", r.id);
    if (!error) refreshed++;
  }
  return { refreshed };
});

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
