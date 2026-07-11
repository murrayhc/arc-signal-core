// Signature miner + live distress matching.
//
// - mineSignatures: from backtest_cases + backtest_signals compute the
//   recall of each signal type among known failures + median lead days.
//   This is RECALL among known failures (how reliably/early the signal
//   precedes collapse), NOT a failure probability.
//
// - computeDistressProfiles: for organisation-type entities the user cares
//   about (via exposure_items) OR behind open outcome_predictions, resolve
//   Companies House number, fetch current charges / insolvency filings /
//   officer resignations within the window, and match against the mined
//   signatures. profile_score is a pattern-match ratio in [0,1].
//
// Guardrails: only real fetched CH data, GBP only, bounded API usage, never
// state a failure probability we have not measured.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chChargesAll,
  chCompanyProfile,
  chFilingHistoryAll,
  chOfficersAll,
  resolveCompanyNumber,
  type CHChargeItem,
  type CHFilingItem,
  type CHOfficerItem,
} from "./collectors/companies-house.server";


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toISODate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Number(((s[mid - 1] + s[mid]) / 2).toFixed(2));
}

// ============= 1. mineSignatures =============

export const mineSignatures = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();

  const { data: cases } = await db.from("backtest_cases").select("id, outcome_date");
  const caseRows = (cases ?? []) as Array<{ id: string; outcome_date: string }>;
  const totalCases = caseRows.length;
  if (totalCases === 0) {
    return { total_cases: 0, signal_types: 0, note: "No backtest cases yet — run the backtest first." };
  }

  const { data: signals } = await db
    .from("backtest_signals")
    .select("case_id, signal_type, signal_date, lead_days");
  const sigRows = (signals ?? []) as Array<{
    case_id: string; signal_type: string; signal_date: string; lead_days: number;
  }>;

  // Per signal_type: unique cases with that signal, plus earliest lead per case.
  const perType = new Map<string, { earliestLeadByCase: Map<string, number> }>();
  for (const r of sigRows) {
    if (!perType.has(r.signal_type)) perType.set(r.signal_type, { earliestLeadByCase: new Map() });
    const bucket = perType.get(r.signal_type)!;
    const prev = bucket.earliestLeadByCase.get(r.case_id);
    // "earliest" = largest lead_days before outcome
    if (prev == null || r.lead_days > prev) bucket.earliestLeadByCase.set(r.case_id, r.lead_days);
  }

  const nowIso = new Date().toISOString();
  let upserted = 0;
  for (const [signal_type, bucket] of perType) {
    const leads = Array.from(bucket.earliestLeadByCase.values());
    const cases_with = bucket.earliestLeadByCase.size;
    const prevalence = totalCases > 0 ? Number((cases_with / totalCases).toFixed(4)) : 0;
    const med = median(leads);
    const { error } = await db
      .from("distress_signatures")
      .upsert(
        {
          signal_type,
          prevalence_in_failures: prevalence,
          median_lead_days: med,
          sample_size: totalCases,
          mined_at: nowIso,
        },
        { onConflict: "signal_type" },
      );
    if (!error) upserted++;
  }

  return { total_cases: totalCases, signal_types: perType.size, upserted };
});

// ============= Read fns =============

export const listSignatures = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db
    .from("distress_signatures")
    .select("signal_type, prevalence_in_failures, median_lead_days, sample_size, mined_at")
    .order("prevalence_in_failures", { ascending: false });
  return { signatures: data ?? [] };
});

export const getEntityDistressProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ entityId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: profile }, { data: sigs }] = await Promise.all([
      db
        .from("company_distress_profiles")
        .select("entity_id, company_number, profile_score, matched_types, window_months, computed_at")
        .eq("entity_id", data.entityId)
        .maybeSingle(),
      db.from("distress_signatures").select("signal_type, sample_size, prevalence_in_failures"),
    ]);
    const signaturesList = (sigs ?? []) as Array<{ signal_type: string; sample_size: number; prevalence_in_failures: number }>;
    const totalSignatures = signaturesList.length;
    const sampleSize = signaturesList.reduce((m, s) => Math.max(m, s.sample_size), 0);
    return { profile: profile ?? null, total_signatures: totalSignatures, sample_size: sampleSize };
  });

// ============= 2. computeDistressProfiles =============

type Matched = { type: string; date: string; historical_median_lead: number | null };

function keepInWindow<T>(rows: T[], dateOf: (r: T) => string | null | undefined, windowMonths: number): T[] {
  const cutoff = Date.now() - windowMonths * 30 * DAY_MS;
  return rows.filter((r) => {
    const d = dateOf(r);
    if (!d) return false;
    const ts = Date.parse(d);
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function earliestChargeSignal(charges: CHChargeItem[], windowMonths: number): Matched | null {
  const inWin = keepInWindow(charges, (c) => c.created_on ?? null, windowMonths);
  let earliest: string | null = null;
  for (const c of inWin) {
    const d = toISODate(c.created_on);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest ? { type: "charge_registered", date: earliest, historical_median_lead: null } : null;
}

function earliestInsolvencyFilingSignal(filings: CHFilingItem[], windowMonths: number): Matched | null {
  const inWin = keepInWindow(filings, (f) => f.date ?? null, windowMonths).filter(
    (f) => (f.category ?? "").toLowerCase() === "insolvency",
  );
  let earliest: string | null = null;
  for (const f of inWin) {
    const d = toISODate(f.date);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest ? { type: "insolvency_filing", date: earliest, historical_median_lead: null } : null;
}

function earliestOfficerResignationSignal(officers: CHOfficerItem[], windowMonths: number): Matched | null {
  const inWin = keepInWindow(officers, (o) => o.resigned_on ?? null, windowMonths);
  let earliest: string | null = null;
  for (const o of inWin) {
    const d = toISODate(o.resigned_on);
    if (!d) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest ? { type: "officer_resignation", date: earliest, historical_median_lead: null } : null;
}

const ComputeInput = z.object({
  maxCompanies: z.number().int().min(1).max(100).optional(),
  windowMonths: z.number().int().min(1).max(60).optional(),
}).optional();

export const computeDistressProfiles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ComputeInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const maxCompanies = Math.max(1, Math.min(100, data?.maxCompanies ?? 20));
    const windowMonths = Math.max(1, Math.min(60, data?.windowMonths ?? 18));

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      return { companies_checked: 0, profiles_written: 0, review_queue_added: 0, notes: ["COMPANIES_HOUSE_API_KEY not set — skipping."] };
    }

    // Load mined signatures (historical median lead + prevalence weights).
    const { data: sigs } = await db
      .from("distress_signatures")
      .select("signal_type, prevalence_in_failures, median_lead_days, sample_size");
    const signatures = (sigs ?? []) as Array<{
      signal_type: string; prevalence_in_failures: number; median_lead_days: number | null; sample_size: number;
    }>;
    if (signatures.length === 0) {
      return { companies_checked: 0, profiles_written: 0, review_queue_added: 0, notes: ["No signatures mined yet — run Mine signatures first."] };
    }
    const signatureByType = new Map(signatures.map((s) => [s.signal_type, s] as const));
    const totalPrevalence = signatures.reduce((sum, s) => sum + Number(s.prevalence_in_failures || 0), 0);

    // 1. Candidate entity ids: exposed via exposure_items + behind open outcome_predictions.
    const notes: string[] = [];
    const candidateEntityIds = new Set<string>();

    const { data: expItems } = await db
      .from("exposure_items")
      .select("entity_id")
      .not("entity_id", "is", null);
    for (const r of expItems ?? []) if (r.entity_id) candidateEntityIds.add(r.entity_id as string);

    const { data: openPreds } = await db
      .from("outcome_predictions")
      .select("event_candidate_id")
      .eq("status", "open")
      .not("event_candidate_id", "is", null);
    const eventIds = Array.from(new Set((openPreds ?? []).map((r) => r.event_candidate_id).filter((x): x is string => !!x)));
    if (eventIds.length) {
      const { data: evs } = await db
        .from("event_candidates")
        .select("primary_entity_id")
        .in("id", eventIds)
        .not("primary_entity_id", "is", null);
      for (const e of evs ?? []) if (e.primary_entity_id) candidateEntityIds.add(e.primary_entity_id as string);
    }

    if (candidateEntityIds.size === 0) {
      return { companies_checked: 0, profiles_written: 0, review_queue_added: 0, notes: ["No exposed or predicted companies to profile."] };
    }

    // 2. Load entity rows, restrict to companies, prioritise least-recently-computed.
    const { data: entRows } = await db
      .from("entities")
      .select("id, canonical_name, entity_type, company_number, company_number_checked_at")
      .in("id", Array.from(candidateEntityIds))
      .in("entity_type", ["company", "organisation", "organization"]);
    const allCandidates = (entRows ?? []) as Array<{
      id: string; canonical_name: string; entity_type: string; company_number: string | null; company_number_checked_at: string | null;
    }>;

    // Pull existing profile computed_at to prioritise stale ones.
    const { data: existingProfiles } = allCandidates.length
      ? await db
          .from("company_distress_profiles")
          .select("entity_id, computed_at")
          .in("entity_id", allCandidates.map((c) => c.id))
      : { data: [] as Array<{ entity_id: string; computed_at: string }> };
    const computedAtByEntity = new Map((existingProfiles ?? []).map((p) => [p.entity_id, p.computed_at] as const));

    const prioritised = [...allCandidates].sort((a, b) => {
      const ta = computedAtByEntity.get(a.id) ? Date.parse(computedAtByEntity.get(a.id)!) : 0;
      const tb = computedAtByEntity.get(b.id) ? Date.parse(computedAtByEntity.get(b.id)!) : 0;
      return ta - tb;
    }).slice(0, maxCompanies);

    let checked = 0;
    let written = 0;
    let reviewAdded = 0;
    let rateLimited = false;

    for (const ent of prioritised) {
      if (rateLimited) { notes.push("Stopped — Companies House rate limited."); break; }
      checked++;

      const number = await resolveCompanyNumber(db, ent, apiKey);
      if (!number) {
        notes.push(`Skipped ${ent.canonical_name} — no Companies House match.`);
        continue;
      }

      let charges: CHChargeItem[] = [];
      let filings: CHFilingItem[] = [];
      let officers: CHOfficerItem[] = [];
      try {
        charges = await chChargesAll(number, apiKey, 3);
        filings = await chFilingHistoryAll(number, apiKey, 6);
        officers = await chOfficersAll(number, apiKey, 3);
      } catch {
        rateLimited = true;
        // Continue with whatever we already fetched.
      }

      const matched: Matched[] = [];
      const chargeSig = earliestChargeSignal(charges, windowMonths);
      if (chargeSig) matched.push(chargeSig);
      const filingSig = earliestInsolvencyFilingSignal(filings, windowMonths);
      if (filingSig) matched.push(filingSig);
      const officerSig = earliestOfficerResignationSignal(officers, windowMonths);
      if (officerSig) matched.push(officerSig);

      // Attach historical_median_lead from mined signatures.
      for (const m of matched) {
        const sig = signatureByType.get(m.type);
        m.historical_median_lead = sig?.median_lead_days == null ? null : Number(sig.median_lead_days);
      }

      // Score: sum of prevalence over matched (whose type has a signature),
      //        divided by sum of prevalence over ALL signatures.
      let matchedPrev = 0;
      for (const m of matched) {
        const sig = signatureByType.get(m.type);
        if (sig) matchedPrev += Number(sig.prevalence_in_failures || 0);
      }
      const score = totalPrevalence > 0 ? Math.max(0, Math.min(1, Number((matchedPrev / totalPrevalence).toFixed(4)))) : 0;

      const { error: upErr } = await db
        .from("company_distress_profiles")
        .upsert(
          {
            entity_id: ent.id,
            company_number: number,
            profile_score: score,
            matched_types: matched,
            window_months: windowMonths,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "entity_id" },
        );
      if (upErr) {
        notes.push(`upsert failed for ${ent.canonical_name}: ${upErr.message}`);
        continue;
      }
      written++;

      // If flagged: raise review_queue (when exposed) AND enrol in the
      // calibration cohort (regardless of exposure). Keep earliest flagged_at.
      if (score >= 0.5) {
        // ---- calibration cohort ----
        const { data: existingCohort } = await db
          .from("distress_cohort")
          .select("id, flagged_at, outcome")
          .eq("entity_id", ent.id)
          .maybeSingle();
        if (!existingCohort) {
          const nowIso = new Date().toISOString();
          const surviveAfter = new Date(Date.now() + 18 * 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
          await db.from("distress_cohort").insert({
            entity_id: ent.id,
            company_number: number,
            flagged_at: nowIso,
            profile_score: score,
            matched_types: matched,
            outcome: "open",
            survive_after: surviveAfter,
          });
        } else if (existingCohort.outcome === "open") {
          // Refresh score/matched_types but keep earliest flagged_at & survive_after.
          await db
            .from("distress_cohort")
            .update({ profile_score: score, matched_types: matched, company_number: number })
            .eq("id", existingCohort.id);
        }

        // ---- review_queue (exposed only) ----
        const isExposed = (expItems ?? []).some((r) => r.entity_id === ent.id);
        if (isExposed) {
          const { data: existing } = await db
            .from("review_queue")
            .select("id")
            .eq("item_type", "distress_profile")
            .eq("item_id", ent.id)
            .eq("status", "pending")
            .limit(1);
          if (!existing || existing.length === 0) {
            const reason = `Distress pattern match ${(score * 100).toFixed(0)}% — ${matched.length} of ${signatures.length} known-failure signal types present for ${ent.canonical_name}.`;
            const { error } = await db.from("review_queue").insert({
              item_type: "distress_profile",
              item_id: ent.id,
              reason: reason.slice(0, 500),
              status: "pending",
            });
            if (!error) reviewAdded++;
          }
        }
      }
    }


    return { companies_checked: checked, profiles_written: written, review_queue_added: reviewAdded, notes };
  });

// ============= 3. resolveCohort =============

const FAILED_STATUSES = new Set([
  "liquidation",
  "administration",
  "insolvency-proceedings",
  "receivership",
  "receiver-action",
  "dissolved",
  "voluntary-arrangement",
]);

export interface ResolveCohortOpts { maxChecks?: number }

export async function resolveCohort(opts: ResolveCohortOpts = {}): Promise<{
  checked: number; failed: number; survived: number; still_open: number; notes: string[];
}> {
  const db = await admin();
  const notes: string[] = [];
  const maxChecks = Math.max(1, Math.min(200, opts.maxChecks ?? 30));

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    notes.push("resolveCohort: COMPANIES_HOUSE_API_KEY not set — skipping.");
    return { checked: 0, failed: 0, survived: 0, still_open: 0, notes };
  }

  // Find Gazette source ids up front for post-flag failure detection.
  const { data: gazetteSources } = await db
    .from("sources")
    .select("id")
    .or("name.ilike.%gazette%,base_url.ilike.%thegazette%");
  const gazetteIds = (gazetteSources ?? []).map((s) => s.id);

  const { data: openRows } = await db
    .from("distress_cohort")
    .select("id, entity_id, company_number, flagged_at, survive_after")
    .eq("outcome", "open")
    .order("flagged_at", { ascending: true })
    .limit(maxChecks);
  const rows = (openRows ?? []) as Array<{
    id: string; entity_id: string; company_number: string | null;
    flagged_at: string; survive_after: string;
  }>;

  // Preload entity names (for Gazette title-match fallback).
  const entityIds = rows.map((r) => r.entity_id);
  const { data: entRows } = entityIds.length
    ? await db.from("entities").select("id, canonical_name").in("id", entityIds)
    : { data: [] as Array<{ id: string; canonical_name: string }> };
  const nameByEntity = new Map((entRows ?? []).map((e) => [e.id, e.canonical_name] as const));

  let checked = 0;
  let failed = 0;
  let survived = 0;
  let stillOpen = 0;
  let rateLimited = false;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  for (const row of rows) {
    if (rateLimited) { notes.push("Stopped — Companies House rate limited."); break; }
    checked++;

    // 1. Try Companies House company profile for a failure status.
    let markedFailed = false;
    let failDetail: string | null = null;

    if (row.company_number) {
      let profile: Awaited<ReturnType<typeof chCompanyProfile>> = null;
      try {
        profile = await chCompanyProfile(row.company_number, apiKey);
      } catch {
        rateLimited = true;
      }
      if (profile?.company_status && FAILED_STATUSES.has(profile.company_status)) {
        markedFailed = true;
        failDetail = `company_status=${profile.company_status}`;
      }
    }

    // 2. Fallback: Gazette corporate-insolvency document whose title contains
    //    the entity's canonical name and is dated after flagged_at.
    if (!markedFailed && gazetteIds.length > 0) {
      const name = nameByEntity.get(row.entity_id);
      if (name && name.trim().length >= 4) {
        const escaped = name.replace(/[%_\\]/g, (m) => "\\" + m);
        const { data: docs } = await db
          .from("documents")
          .select("id, published_at, title")
          .in("source_id", gazetteIds)
          .gte("published_at", row.flagged_at)
          .not("published_at", "is", null)
          .ilike("title", `%${escaped}%`)
          .limit(1);
        if (docs && docs.length > 0) {
          markedFailed = true;
          failDetail = `gazette_notice=${(docs[0].title ?? "").slice(0, 200)}`;
        }
      }
    }



    if (markedFailed) {
      await db.from("distress_cohort").update({
        outcome: "failed",
        outcome_detail: (failDetail ?? "failure detected").slice(0, 500),
        resolved_at: nowIso,
      }).eq("id", row.id);
      failed++;
      continue;
    }

    // 3. Survival: past survive_after with no failure signal.
    const surviveAfterMs = Date.parse(row.survive_after + "T00:00:00Z");
    if (Number.isFinite(surviveAfterMs) && nowMs > surviveAfterMs) {
      await db.from("distress_cohort").update({
        outcome: "survived",
        outcome_detail: "no failure signal within 18 months",
        resolved_at: nowIso,
      }).eq("id", row.id);
      survived++;
      continue;
    }

    stillOpen++;
  }

  return { checked, failed, survived, still_open: stillOpen, notes };
}

export const resolveCohortNow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ maxChecks: z.number().int().min(1).max(200).optional() }).optional().parse(d))
  .handler(async ({ data }) => resolveCohort({ maxChecks: data?.maxChecks }));

// ============= 4. computeCalibration =============

export interface CalibrationBand {
  band: string;
  min: number;
  max: number;
  failed: number;
  survived: number;
  open: number;
  resolved: number;
  failure_rate: number | null; // null when resolved === 0
}
export interface CalibrationResult {
  overall: { failed: number; survived: number; open: number; resolved: number; failure_rate: number | null };
  bands: CalibrationBand[];
  min_headline_sample: 30;
}

export const computeCalibration = createServerFn({ method: "GET" }).handler(async (): Promise<CalibrationResult> => {
  const db = await admin();
  const { data } = await db
    .from("distress_cohort")
    .select("outcome, profile_score");
  const rows = (data ?? []) as Array<{ outcome: string; profile_score: number | null }>;

  const bandDefs: Array<{ band: string; min: number; max: number }> = [
    { band: "0.50–0.69", min: 0.5, max: 0.7 },
    { band: "0.70–0.84", min: 0.7, max: 0.85 },
    { band: "0.85–1.00", min: 0.85, max: 1.0001 },
  ];

  const bands: CalibrationBand[] = bandDefs.map((b) => ({
    ...b, failed: 0, survived: 0, open: 0, resolved: 0, failure_rate: null,
  }));

  let failed = 0, survived = 0, open = 0;
  for (const r of rows) {
    const s = Number(r.profile_score ?? 0);
    if (r.outcome === "failed") failed++;
    else if (r.outcome === "survived") survived++;
    else open++;
    for (const b of bands) {
      if (s >= b.min && s < b.max) {
        if (r.outcome === "failed") b.failed++;
        else if (r.outcome === "survived") b.survived++;
        else b.open++;
      }
    }
  }
  for (const b of bands) {
    b.resolved = b.failed + b.survived;
    b.failure_rate = b.resolved > 0 ? Number((b.failed / b.resolved).toFixed(4)) : null;
  }
  const resolved = failed + survived;
  return {
    overall: {
      failed, survived, open, resolved,
      failure_rate: resolved > 0 ? Number((failed / resolved).toFixed(4)) : null,
    },
    bands,
    min_headline_sample: 30,
  };
});
