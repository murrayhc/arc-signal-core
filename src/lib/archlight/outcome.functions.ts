// Prediction ledger: immutable receipts per event + per scenario_projection.
// Frozen at creation. Only `final_probability` (and resolution fields) may
// change afterwards; the DB trigger enforces immutability of the rest.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callJson, guardFinancialAdvice } from "./ai-gateway.server";
import { deriveIndependenceGroup } from "./text.server";

type SourceMeta = { reliability_score: number; is_synthetic: boolean; group: string };

async function loadSourceMetaMap(
  db: Awaited<ReturnType<typeof admin>>,
  ids: string[],
): Promise<Map<string, SourceMeta>> {
  const out = new Map<string, SourceMeta>();
  if (!ids.length) return out;
  const { data } = await db
    .from("sources")
    .select("id, reliability_score, is_synthetic, independence_group, base_url, feed_url, name")
    .in("id", ids);
  for (const s of data ?? []) {
    const row = s as { id: string; reliability_score: number | null; is_synthetic: boolean | null; independence_group: string | null; base_url: string | null; feed_url: string | null; name: string };
    const group = (row.independence_group ?? "").trim() ||
      deriveIndependenceGroup(row.base_url ?? row.feed_url, row.name, !!row.is_synthetic, row.id);
    out.set(row.id, {
      reliability_score: Number(row.reliability_score ?? 0),
      is_synthetic: !!row.is_synthetic,
      group,
    });
  }
  return out;
}


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
      let groupIds: string[] = [];

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
          const sourceIdSet = new Set<string>();
          const daySet = new Set<string>();
          for (const l of lineage ?? []) {
            if (l.source_id) sourceIdSet.add(String(l.source_id));
            if (l.published_at) {
              const d = new Date(l.published_at);
              if (!isNaN(d.getTime())) daySet.add(d.toISOString().slice(0, 10));
            }
          }
          // Publisher groups (independence_group), not raw source rows.
          const metaMap = await loadSourceMetaMap(db, Array.from(sourceIdSet));
          const groupSet = new Set<string>();
          for (const sid of sourceIdSet) {
            const g = metaMap.get(sid)?.group;
            if (g) groupSet.add(g);
          }
          groups = groupSet.size;
          supportDays = daySet.size;
          groupIds = Array.from(groupSet);
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
          group_ids: groupIds,
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
          group_ids: groupIds,
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

// ============================================================================
// RESOLUTION ENGINE
// ============================================================================

type Baseline = {
  groups: number;
  entity_ids: string[];
  contradiction_count: number;
  support_days: number;
  leading_indicators: string[];
  contradicting_signals: string[];
  // Persisted set of frozen source ids (added on subsequent scans if missing).
  group_ids?: string[];
};

type PredictionRow = {
  id: string;
  subject_kind: string;
  event_candidate_id: string;
  scenario_projection_id: string | null;
  predicted_probability: number;
  final_probability: number;
  predicted_at: string;
  deadline: string;
  horizon: string | null;
  evidence_canonical_ids: string[];
  baseline: Baseline;
};

type EvidenceSnapshot = {
  canonicalIds: string[];
  bySource: Map<string, { source_id: string; published_at: string | null; url: string | null; canonicalId: string }[]>;
  contradictionCount: number;
  atomicTexts: { text: string; published_at: string | null; source_id: string }[];
};

async function loadEventEvidence(
  db: Awaited<ReturnType<typeof admin>>,
  eventId: string,
): Promise<EvidenceSnapshot> {
  const { data: impactRows } = await db
    .from("company_impacts")
    .select("evidence_ids")
    .eq("event_candidate_id", eventId);
  const atomicIds = Array.from(
    new Set((impactRows ?? []).flatMap((r) => (r.evidence_ids ?? []) as string[])),
  ).slice(0, 400);
  if (atomicIds.length === 0) {
    return { canonicalIds: [], bySource: new Map(), contradictionCount: 0, atomicTexts: [] };
  }
  const { data: atomics } = await db
    .from("atomic_claims")
    .select("id, claim_text, canonical_claim_id, source_id, document_id")
    .in("id", atomicIds);
  const rows = atomics ?? [];
  const canonicalIds = Array.from(
    new Set(rows.map((a) => a.canonical_claim_id).filter((x): x is string => !!x)),
  );
  let contradictionCount = 0;
  const bySource = new Map<string, { source_id: string; published_at: string | null; url: string | null; canonicalId: string }[]>();
  if (canonicalIds.length) {
    const [{ data: cans }, { data: lineage }] = await Promise.all([
      db.from("canonical_claims").select("id, contradiction_count").in("id", canonicalIds),
      db
        .from("claim_lineage")
        .select("canonical_claim_id, source_id, published_at, url")
        .in("canonical_claim_id", canonicalIds),
    ]);
    contradictionCount = (cans ?? []).reduce((a, c) => a + Number(c.contradiction_count ?? 0), 0);
    for (const l of lineage ?? []) {
      if (!l.source_id) continue;
      const key = String(l.source_id);
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key)!.push({
        source_id: key,
        published_at: l.published_at,
        url: l.url,
        canonicalId: l.canonical_claim_id,
      });
    }
  }
  // Recent atomic-claim texts for scenario grading.
  const docIds = Array.from(new Set(rows.map((r) => r.document_id).filter((x): x is string => !!x)));
  const pubMap = new Map<string, string | null>();
  if (docIds.length) {
    const { data: docs } = await db
      .from("documents")
      .select("id, published_at")
      .in("id", docIds);
    for (const d of docs ?? []) pubMap.set(d.id, d.published_at ?? null);
  }
  const atomicTexts = rows
    .map((r) => ({
      text: r.claim_text ?? "",
      published_at: pubMap.get(r.document_id) ?? null,
      source_id: r.source_id ?? "",
    }))
    .filter((r) => r.text.trim().length > 0);
  return { canonicalIds, bySource, contradictionCount, atomicTexts };
}

function safeRationale(s: string): string {
  const guard = guardFinancialAdvice(s);
  if (!guard.ok) return `Resolution recorded on ${new Date().toISOString().slice(0, 10)}.`;
  return s.slice(0, 900);
}

function brier(prob: number, y: 0 | 1): number {
  return Number(Math.pow(prob - y, 2).toFixed(6));
}

async function enqueueReview(
  db: Awaited<ReturnType<typeof admin>>,
  predictionId: string,
  reason: string,
): Promise<boolean> {
  const { data: existing } = await db
    .from("review_queue")
    .select("id")
    .eq("item_type", "prediction_resolution")
    .eq("item_id", predictionId)
    .eq("status", "pending")
    .limit(1);
  if (existing && existing.length > 0) return false;
  const { error } = await db.from("review_queue").insert({
    item_type: "prediction_resolution",
    item_id: predictionId,
    reason: reason.slice(0, 500),
    status: "pending",
  });
  return !error;
}

interface GradeScenarioResult {
  scenario_projection_id: string;
  classification: "borne_out" | "partial" | "refuted" | "none";
  matched_indicators: string[];
  matched_contradictions: string[];
}

async function gradeScenariosViaAI(
  eventTitle: string,
  atomicTexts: { text: string; published_at: string | null }[],
  scenarios: { scenario_projection_id: string; label: string; leading: string[]; contradicting: string[] }[],
): Promise<GradeScenarioResult[] | null> {
  if (scenarios.length === 0) return [];
  const recent = atomicTexts
    .filter((t) => t.text)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 40)
    .map((t, i) => `[${i + 1}] ${t.text.slice(0, 300)}`)
    .join("\n");
  const scenarioList = scenarios.map((s, i) => ({
    idx: i,
    id: s.scenario_projection_id,
    label: s.label,
    leading: s.leading.slice(0, 8),
    contradicting: s.contradicting.slice(0, 8),
  }));
  const user = `Event: ${eventTitle}\n\nLater supporting evidence (recent atomic claims):\n${recent || "(none)"}\n\nScenarios to grade:\n${JSON.stringify(scenarioList, null, 2)}\n\nFor each scenario, decide which of its OWN frozen leading_indicators occurred and which contradicting_signals occurred, based ONLY on the evidence above. Then classify:\n- borne_out: majority of leading indicators occurred; no contradictions.\n- partial: some leading indicators occurred OR mixed with contradictions.\n- refuted: majority of contradicting signals occurred and few/no leading indicators.\n- none: not enough evidence to decide either way.\n\nReturn STRICT JSON: {"results":[{"scenario_projection_id":"...","classification":"borne_out|partial|refuted|none","matched_indicators":["..."],"matched_contradictions":["..."]}]}`;
  const res = await callJson<{ results?: GradeScenarioResult[] }>({
    task: "contradiction_analysis",
    system: "You grade scenario outcomes strictly from provided evidence. Be conservative. Never speculate. Output ONLY valid JSON.",
    user,
  });
  if (!res.ok || !res.data?.results) return null;
  return res.data.results.filter((r) => r && r.scenario_projection_id);
}

export const resolveOutcomes = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  let resolved = 0;
  let pending = 0;

  const { data: openRows } = await db
    .from("outcome_predictions")
    .select(
      "id, subject_kind, event_candidate_id, scenario_projection_id, predicted_probability, final_probability, predicted_at, deadline, horizon, evidence_canonical_ids, baseline",
    )
    .eq("status", "open");
  const openList = (openRows ?? []) as unknown as PredictionRow[];
  if (openList.length === 0) return { predictions_resolved: 0, predictions_pending_review: 0 };

  // Group receipts by event.
  const byEvent = new Map<string, PredictionRow[]>();
  for (const r of openList) {
    if (!byEvent.has(r.event_candidate_id)) byEvent.set(r.event_candidate_id, []);
    byEvent.get(r.event_candidate_id)!.push(r);
  }

  const eventIds = Array.from(byEvent.keys());
  const { data: evRows } = await db
    .from("event_candidates")
    .select("id, title, status, first_detected_at")
    .in("id", eventIds);
  const evMap = new Map((evRows ?? []).map((e) => [e.id, e] as const));
  const now = new Date();

  for (const [eventId, receipts] of byEvent.entries()) {
    const ev = evMap.get(eventId);
    if (!ev) continue;
    const snap = await loadEventEvidence(db, eventId);

    // Per-source metadata (reliability, is_synthetic, publisher group) for
    // every CURRENT supporting source. Kept per-source so lead-time and
    // primary-corroboration still see individual reliability, while
    // independence tallies only count distinct PUBLISHER GROUPS.
    const currentSourceIds = Array.from(snap.bySource.keys());
    const srcMap = await loadSourceMetaMap(db, currentSourceIds);
    const currentGroups = new Set<string>();
    for (const sid of currentSourceIds) {
      const g = srcMap.get(sid)?.group;
      if (g) currentGroups.add(g);
    }

    // Min reliability across canonicals.
    let minReliability = 1;
    if (snap.canonicalIds.length) {
      const { data: cans } = await db
        .from("canonical_claims")
        .select("reliability_score")
        .in("id", snap.canonicalIds);
      for (const c of cans ?? []) {
        const v = Number(c.reliability_score ?? 1);
        if (Number.isFinite(v) && v < minReliability) minReliability = v;
      }
    }

    // Split event / scenario receipts.
    const eventReceipt = receipts.find((r) => r.subject_kind === "event");
    const scenarioReceipts = receipts.filter((r) => r.subject_kind === "scenario");

    let eventOutcome: "happened" | "did_not_happen" | null = null;
    let eventResolvedBy: "auto_evidence" | "auto_deadline" | "review" | null = null;

    if (eventReceipt) {
      // Baseline stores frozen PUBLISHER GROUPS (not raw source_ids).
      const baseGroups = new Set<string>(
        Array.isArray(eventReceipt.baseline?.group_ids)
          ? (eventReceipt.baseline!.group_ids as string[])
          : [],
      );
      const newGroupIds = Array.from(currentGroups).filter((g) => !baseGroups.has(g));
      const newGroups = newGroupIds.length;
      // Source_ids that belong to at least one NEW group — used for URLs,
      // canonicals, and lead-time (per-source data still matters here).
      const newGroupSet = new Set(newGroupIds);
      const newSourceIds = currentSourceIds.filter((sid) => {
        const g = srcMap.get(sid)?.group;
        return !!g && newGroupSet.has(g);
      });
      const newContradictions = Math.max(0, snap.contradictionCount - Number(eventReceipt.baseline?.contradiction_count ?? 0));
      // Primary corroboration: at least one NEW GROUP contains a
      // high-reliability, non-synthetic source.
      const primaryCorroboration = newSourceIds.some((sid) => {
        const s = srcMap.get(sid);
        return !!s && s.reliability_score > 0.8 && !s.is_synthetic;
      });
      const deadlinePassed = new Date(eventReceipt.deadline).getTime() < now.getTime();
      const eventDismissed = ev.status === "dismissed";
      const evidenceUrls = Array.from(
        new Set(
          newSourceIds
            .flatMap((sid) => (snap.bySource.get(sid) ?? []).map((l) => l.url ?? ""))
            .filter(Boolean),
        ),
      ).slice(0, 20);
      const newCanonicalIds = Array.from(
        new Set(
          newSourceIds.flatMap((sid) => (snap.bySource.get(sid) ?? []).map((l) => l.canonicalId)),
        ),
      ).slice(0, 20);

      let decision: { outcome: "happened" | "did_not_happen"; by: "auto_evidence" | "auto_deadline"; rationale: string } | null = null;
      let queueReason: string | null = null;

      if (primaryCorroboration || (newGroups >= 2 && newContradictions === 0)) {
        decision = {
          outcome: "happened",
          by: "auto_evidence",
          rationale: primaryCorroboration
            ? `Confirmed by ${newGroups} new publisher group(s), including at least one high-reliability primary source (reliability > 0.8, non-synthetic). Minimum canonical reliability ${minReliability.toFixed(2)}.`
            : `Confirmed by ${newGroups} new independent publisher group(s) with no new contradictions.`,
        };
      } else if (newContradictions >= 2 || (newContradictions >= 1 && newGroups === 0)) {
        decision = {
          outcome: "did_not_happen",
          by: "auto_evidence",
          rationale: `Contradicted: ${newContradictions} new contradiction(s) vs ${newGroups} new supporting publisher group(s).`,
        };
      } else if (eventDismissed) {
        queueReason = `Underlying event was dismissed while receipt was open.`;
      } else if (deadlinePassed && newGroups === 0 && newContradictions === 0) {
        decision = {
          outcome: "did_not_happen",
          by: "auto_deadline",
          rationale: `Deadline (${eventReceipt.deadline.slice(0, 10)}) passed without any new supporting evidence or contradictions.`,
        };
      } else if (deadlinePassed && newGroups >= 1 && newContradictions >= 1) {
        queueReason = `Past deadline with mixed evidence: ${newGroups} new supporter(s) and ${newContradictions} new contradiction(s).`;
      }

      if (decision) {
        const y: 0 | 1 = decision.outcome === "happened" ? 1 : 0;
        // Lead time vs mainstream press: how many days earlier (positive) or
        // later (negative) Archlight detected this compared to the first
        // mainstream-tier report. Null + before_mainstream=true means no
        // mainstream outlet covered it at all (an exclusive).
        let leadTimeDays: number | null = null;
        let beforeMainstream = false;
        if (decision.outcome === "happened" && ev.first_detected_at) {
          const firstDetected = new Date(ev.first_detected_at).getTime();
          const allSids = Array.from(snap.bySource.keys());
          let mainstreamFirstMs: number | null = null;
          if (allSids.length) {
            const { data: tierRows } = await db
              .from("sources")
              .select("id, tier")
              .in("id", allSids);
            const mainstreamSet = new Set(
              (tierRows ?? [])
                .filter((r) => (r as { tier?: string }).tier === "mainstream")
                .map((r) => r.id as string),
            );
            for (const sid of allSids) {
              if (!mainstreamSet.has(sid)) continue;
              for (const l of snap.bySource.get(sid) ?? []) {
                if (!l.published_at) continue;
                const ts = new Date(l.published_at).getTime();
                if (!Number.isFinite(ts)) continue;
                if (mainstreamFirstMs == null || ts < mainstreamFirstMs) mainstreamFirstMs = ts;
              }
            }
          }
          if (mainstreamFirstMs != null) {
            // Positive = Archlight was earlier than the first mainstream report.
            leadTimeDays = Number(((mainstreamFirstMs - firstDetected) / DAY_MS).toFixed(2));
          } else {
            leadTimeDays = null;
            beforeMainstream = true;
          }
        }
        const { error } = await db
          .from("outcome_predictions")
          .update({
            status: "resolved",
            outcome: decision.outcome,
            resolved_by: decision.by,
            resolved_at: new Date().toISOString(),
            resolution_rationale: safeRationale(decision.rationale),
            resolution_evidence: { new_canonical_ids: newCanonicalIds, urls: evidenceUrls },
            brier_first: brier(Number(eventReceipt.predicted_probability), y),
            brier_final: brier(Number(eventReceipt.final_probability), y),
            lead_time_days: leadTimeDays,
            before_mainstream: beforeMainstream,
          })
          .eq("id", eventReceipt.id);
        if (!error) {
          resolved++;
          eventOutcome = decision.outcome;
          eventResolvedBy = decision.by;
        }
      } else if (queueReason) {
        if (await enqueueReview(db, eventReceipt.id, queueReason)) pending++;
      }
    }

    // Scenario grading: trigger when scenario deadline has passed OR event auto-resolved 'did_not_happen' (by contradiction path only).
    const contradictionResolved = eventOutcome === "did_not_happen" && eventResolvedBy === "auto_evidence";
    const scenariosToGrade = scenarioReceipts.filter((s) => {
      const pastDeadline = new Date(s.deadline).getTime() < now.getTime();
      return pastDeadline || contradictionResolved;
    });
    if (scenariosToGrade.length === 0) continue;
    const graded = await gradeScenariosViaAI(
      String(ev.title ?? "Event"),
      snap.atomicTexts,
      scenariosToGrade.map((s) => ({
        scenario_projection_id: s.scenario_projection_id!,
        label: s.evidence_canonical_ids?.length ? `receipt ${s.id.slice(0, 8)}` : `receipt ${s.id.slice(0, 8)}`,
        leading: (s.baseline?.leading_indicators ?? []) as string[],
        contradicting: (s.baseline?.contradicting_signals ?? []) as string[],
      })),
    );
    if (!graded) continue; // AI failed — leave open, retry next scan.
    const gradeMap = new Map(graded.map((g) => [g.scenario_projection_id, g] as const));
    const byMethod: "auto_evidence" | "auto_deadline" = contradictionResolved ? "auto_evidence" : "auto_deadline";
    for (const rec of scenariosToGrade) {
      const g = gradeMap.get(rec.scenario_projection_id!);
      if (!g) continue;
      const observed = g.classification;
      const outcome: "happened" | "did_not_happen" = observed === "borne_out" ? "happened" : "did_not_happen";
      const y: 0 | 1 = observed === "borne_out" ? 1 : 0;
      const parts: string[] = [];
      if (g.matched_indicators.length) parts.push(`Leading indicators observed: ${g.matched_indicators.slice(0, 6).join("; ")}`);
      if (g.matched_contradictions.length) parts.push(`Contradicting signals observed: ${g.matched_contradictions.slice(0, 6).join("; ")}`);
      if (!parts.length) parts.push(`No frozen indicators clearly matched the later evidence.`);
      const rationale = `Scenario ${observed}. ${parts.join(" | ")}`;
      const { error } = await db
        .from("outcome_predictions")
        .update({
          status: "resolved",
          outcome,
          observed_path: observed,
          resolved_by: byMethod,
          resolved_at: new Date().toISOString(),
          resolution_rationale: safeRationale(rationale),
          resolution_evidence: { matched_indicators: g.matched_indicators, matched_contradictions: g.matched_contradictions },
          brier_first: brier(Number(rec.predicted_probability), y),
          brier_final: brier(Number(rec.final_probability), y),
        })
        .eq("id", rec.id);
      if (!error) resolved++;
    }
  }

  return { predictions_resolved: resolved, predictions_pending_review: pending };
});

// Human verdict from the review queue.
interface VerdictInput {
  predictionId: string;
  verdict: "happened" | "did_not_happen" | "unresolvable" | "needs_more";
  note?: string;
  reviewer?: string;
}

export const applyPredictionVerdict = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        predictionId: z.string().uuid(),
        verdict: z.enum(["happened", "did_not_happen", "unresolvable", "needs_more"]),
        note: z.string().max(500).optional(),
        reviewer: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }: { data: VerdictInput }) => {
    const db = await admin();
    const reviewer = (data.reviewer ?? "owner").slice(0, 120);
    const { data: rec } = await db
      .from("outcome_predictions")
      .select(
        "id, subject_kind, event_candidate_id, scenario_projection_id, predicted_probability, final_probability, baseline",
      )
      .eq("id", data.predictionId)
      .maybeSingle();
    if (!rec) throw new Error("Prediction not found");

    const noteSuffix = data.note ? ` — ${data.note.slice(0, 300)}` : "";

    if (data.verdict === "needs_more") {
      await db
        .from("outcome_predictions")
        .update({ status: "open" })
        .eq("id", rec.id);
      await db
        .from("review_queue")
        .update({ status: "needs_more_evidence", reviewed_by: reviewer })
        .eq("item_type", "prediction_resolution")
        .eq("item_id", rec.id)
        .eq("status", "pending");
      return { ok: true, status: "reopened" };
    }

    const outcome = data.verdict; // happened | did_not_happen | unresolvable
    const y: 0 | 1 | null = outcome === "happened" ? 1 : outcome === "did_not_happen" ? 0 : null;
    const rationale = safeRationale(`Human verdict: ${outcome}${noteSuffix}`);
    const { error } = await db
      .from("outcome_predictions")
      .update({
        status: "resolved",
        outcome,
        resolved_by: "review",
        resolved_at: new Date().toISOString(),
        resolution_rationale: rationale,
        brier_first: y == null ? null : brier(Number(rec.predicted_probability), y),
        brier_final: y == null ? null : brier(Number(rec.final_probability), y),
      })
      .eq("id", rec.id);
    if (error) throw new Error(error.message);

    const reviewStatus: "approved" | "rejected" = outcome === "happened" ? "approved" : "rejected";
    const { data: rqRow } = await db
      .from("review_queue")
      .select("id")
      .eq("item_type", "prediction_resolution")
      .eq("item_id", rec.id)
      .eq("status", "pending")
      .maybeSingle();
    await db
      .from("review_queue")
      .update({ status: reviewStatus, reviewer_notes: data.note ?? null, reviewed_by: reviewer })
      .eq("item_type", "prediction_resolution")
      .eq("item_id", rec.id)
      .eq("status", "pending");

    // Attribution: record the verdict as a graded prediction (accrues over time).
    try {
      const { recordReviewerVerdict } = await import("./reviewers.functions");
      await recordReviewerVerdict({
        reviewer,
        reviewItemId: rqRow?.id ?? null,
        itemType: "prediction_resolution",
        subjectKind: "prediction",
        subjectId: rec.id,
        verdict: outcome,
      });
    } catch { /* never fail a verdict on attribution */ }


    // If this was an event receipt, grade its still-open scenarios.
    if (rec.subject_kind === "event") {
      const { data: ev } = await db
        .from("event_candidates")
        .select("id, title")
        .eq("id", rec.event_candidate_id)
        .maybeSingle();
      const { data: scRows } = await db
        .from("outcome_predictions")
        .select(
          "id, scenario_projection_id, predicted_probability, final_probability, baseline",
        )
        .eq("event_candidate_id", rec.event_candidate_id)
        .eq("subject_kind", "scenario")
        .eq("status", "open");
      const scList = (scRows ?? []) as unknown as PredictionRow[];
      if (ev && scList.length) {
        const snap = await loadEventEvidence(db, rec.event_candidate_id);
        const graded = await gradeScenariosViaAI(
          String(ev.title ?? "Event"),
          snap.atomicTexts,
          scList.map((s) => ({
            scenario_projection_id: s.scenario_projection_id!,
            label: `receipt ${s.id.slice(0, 8)}`,
            leading: (s.baseline?.leading_indicators ?? []) as string[],
            contradicting: (s.baseline?.contradicting_signals ?? []) as string[],
          })),
        );
        if (graded) {
          const gradeMap = new Map(graded.map((g) => [g.scenario_projection_id, g] as const));
          for (const s of scList) {
            const g = gradeMap.get(s.scenario_projection_id!);
            if (!g) continue;
            const scOutcome: "happened" | "did_not_happen" = g.classification === "borne_out" ? "happened" : "did_not_happen";
            const yy: 0 | 1 = g.classification === "borne_out" ? 1 : 0;
            const parts: string[] = [];
            if (g.matched_indicators.length) parts.push(`Leading indicators observed: ${g.matched_indicators.slice(0, 6).join("; ")}`);
            if (g.matched_contradictions.length) parts.push(`Contradicting signals observed: ${g.matched_contradictions.slice(0, 6).join("; ")}`);
            if (!parts.length) parts.push(`No frozen indicators clearly matched the later evidence.`);
            await db
              .from("outcome_predictions")
              .update({
                status: "resolved",
                outcome: scOutcome,
                observed_path: g.classification,
                resolved_by: "review",
                resolved_at: new Date().toISOString(),
                resolution_rationale: safeRationale(`Scenario ${g.classification} (graded after human verdict on event). ${parts.join(" | ")}`),
                resolution_evidence: { matched_indicators: g.matched_indicators, matched_contradictions: g.matched_contradictions },
                brier_first: brier(Number(s.predicted_probability), yy),
                brier_final: brier(Number(s.final_probability), yy),
              })
              .eq("id", s.id);
          }
        }
      }
    }

    return { ok: true, status: "resolved", outcome };
  });


export const getEventPredictions = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data }: { data: { eventId: string } }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("outcome_predictions")
      .select(
        "id, subject_kind, horizon, prediction_text, predicted_probability, final_probability, predicted_at, deadline, status, outcome, observed_path, resolved_by, resolved_at, resolution_rationale, brier_first, lead_time_days, scenario_projection_id",
      )
      .eq("event_candidate_id", data.eventId)
      .order("subject_kind", { ascending: true })
      .order("deadline", { ascending: true });
    return { predictions: rows ?? [] };
  });
