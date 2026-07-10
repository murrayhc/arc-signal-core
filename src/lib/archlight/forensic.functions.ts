import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callJson, callAI, guardFinancialAdvice } from "./ai-gateway.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const SubjectInput = z.object({
  subject_type: z.enum(["opportunity", "event"]),
  subject_id: z.string().uuid(),
  force: z.boolean().optional(),
});

export interface ForensicReport {
  executive_summary: string;
  headline_thesis: string;
  layman_thesis?: string;
  quantitative_sizing: {
    tam_view: string;
    revenue_impact_range: string;
    bear_case: string;
    base_case: string;
    bull_case: string;
    confidence_band: string;
    key_assumptions: string[];
    bull_triggers?: string[];
    bear_triggers?: string[];
  };
  causal_chain: {
    upstream_drivers: string[];
    trigger_event: string;
    first_order_effects: string[];
    second_order_effects: string[];
    third_order_effects: string[];
  };
  exposure_map: {
    beneficiaries: Array<{ name: string; kind: string; magnitude: string; reasoning: string }>;
    harmed: Array<{ name: string; kind: string; magnitude: string; reasoning: string }>;
    neutral_watch: Array<{ name: string; kind: string; reasoning: string }>;
  };
  historical_precedents: Array<{ label: string; period: string; parallel: string; outcome: string; caveat: string }>;
  contrarian_view: string;
  data_gaps: string[];
  catalysts_and_watch_signals: Array<{ signal: string; leading_or_lagging: string; cadence: string; source_hint: string }>;
  timeline: {
    reference_date?: string;
    data_as_of?: string;
    immediate_0_7d: string;
    near_8_30d: string;
    medium_1_3m: string;
    strategic_3_12m: string;
    inflection_points: string[];
  };
  risk_factors: string[];
  positioning_plays: Array<{ archetype: string; play: string; hedge: string; monitor: string }>;
  final_synopsis?: string;
  quality: {
    evidence_strength: number;
    source_diversity: number;
    contradiction_pressure: number;
    overall_confidence: number;
  };
}

interface ForensicRow {
  id: string;
  status: string;
  model: string | null;
  report: ForensicReport | null;
  confidence: number | null;
  updated_at: string;
  notes: string | null;
}

// ============ READ (cached) ============
export const getForensicReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubjectInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db
      .from("forensic_reports")
      .select("id, status, model, report, confidence, updated_at, notes")
      .eq("subject_type", data.subject_type)
      .eq("subject_id", data.subject_id)
      .maybeSingle();
    if (!row) return { report: null, cached: false, age_ms: null, fresh: false };
    const age = Date.now() - new Date(row.updated_at).getTime();
    return {
      report: row as ForensicRow,
      cached: true,
      age_ms: age,
      fresh: age < SEVEN_DAYS_MS && row.status === "ok",
    };
  });

// ============ GENERATE ============
export const runForensicAnalysis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SubjectInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();

    // Cache check
    if (!data.force) {
      const { data: existing } = await db
        .from("forensic_reports")
        .select("id, status, updated_at")
        .eq("subject_type", data.subject_type)
        .eq("subject_id", data.subject_id)
        .maybeSingle();
      if (existing && existing.status === "ok") {
        const age = Date.now() - new Date(existing.updated_at).getTime();
        if (age < SEVEN_DAYS_MS) return { ok: true, cached: true };
      }
    }

    // === Assemble context ===
    let subjectTitle = "";
    let subjectSummary = "";
    let subjectType = "";
    let sectors: string[] = [];
    let regions: string[] = [];
    let eventId: string | null = null;
    let opportunityId: string | null = null;

    if (data.subject_type === "opportunity") {
      opportunityId = data.subject_id;
      const { data: opp } = await db.from("opportunity_cards").select("*").eq("id", data.subject_id).maybeSingle();
      if (!opp) return { ok: false, error: "Opportunity not found" };
      subjectTitle = opp.title;
      subjectSummary = [opp.summary, opp.buyer_pain, opp.opportunity_logic, opp.suggested_offer].filter(Boolean).join("\n\n");
      subjectType = opp.opportunity_type ?? "opportunity";
      sectors = (opp.affected_sectors ?? []) as string[];
      regions = (opp.affected_regions ?? []) as string[];
      eventId = opp.event_candidate_id ?? null;
    } else {
      eventId = data.subject_id;
      const { data: ev } = await db.from("event_candidates").select("*").eq("id", data.subject_id).maybeSingle();
      if (!ev) return { ok: false, error: "Event not found" };
      subjectTitle = ev.title;
      subjectSummary = ev.summary ?? "";
      subjectType = ev.event_class ?? "event";
      sectors = ev.affected_sector ? [ev.affected_sector] : [];
      regions = ev.affected_region ? [ev.affected_region] : [];
    }

    // Related event, impacts, competitors, positioning, contradictions, claims
    const [eventRes, impactsRes, positioningRes, oppsRes] = await Promise.all([
      eventId ? db.from("event_candidates").select("*").eq("id", eventId).maybeSingle() : Promise.resolve({ data: null }),
      eventId ? db.from("company_impacts").select("company_name, impact_type, impact_pathway, risk_score, opportunity_score, confidence, watch_signals, evidence_ids").eq("event_candidate_id", eventId).limit(30) : Promise.resolve({ data: [] }),
      opportunityId
        ? db.from("strategic_positioning").select("title, user_type, how_it_could_be_used, why_it_may_matter, positioning_angle, constraints, confidence").eq("opportunity_card_id", opportunityId).limit(12)
        : eventId ? db.from("strategic_positioning").select("title, user_type, how_it_could_be_used, why_it_may_matter, positioning_angle, constraints, confidence").eq("event_candidate_id", eventId).limit(12) : Promise.resolve({ data: [] }),
      eventId ? db.from("opportunity_cards").select("title, opportunity_type, summary, buyer_pain, likely_buyers, suggested_offer, urgency_score, commercial_value_score, confidence").eq("event_candidate_id", eventId).limit(6) : Promise.resolve({ data: [] }),
    ]);

    const evidenceIds = Array.from(new Set(((impactsRes.data ?? []) as Array<{ evidence_ids: string[] | null }>).flatMap((i) => i.evidence_ids ?? []))).slice(0, 30);
    let evidenceLines: string[] = [];
    if (evidenceIds.length) {
      const { data: atomics } = await db.from("atomic_claims").select("id, claim_text, claim_type, factuality_label, extraction_confidence, source_id").in("id", evidenceIds);
      const sourceIds = Array.from(new Set(((atomics ?? []) as Array<{ source_id: string }>).map((a) => a.source_id)));
      const { data: srcs } = sourceIds.length ? await db.from("sources").select("id, name, reliability_score").in("id", sourceIds) : { data: [] as Array<{ id: string; name: string; reliability_score: number }> };
      const srcMap = new Map(((srcs ?? []) as Array<{ id: string; name: string; reliability_score: number }>).map((s) => [s.id, s]));
      evidenceLines = ((atomics ?? []) as Array<{ id: string; claim_text: string; claim_type: string; factuality_label: string | null; extraction_confidence: number | null; source_id: string }>).map((a) => {
        const s = srcMap.get(a.source_id);
        return `- [${a.claim_type}${a.factuality_label ? "/" + a.factuality_label : ""} conf=${Number(a.extraction_confidence ?? 0).toFixed(2)}] "${a.claim_text}" — source: ${s?.name ?? "?"} (rel=${s ? Number(s.reliability_score).toFixed(2) : "?"})`;
      });
    }

    // Historical precedents from similar past events
    const { data: pastEvents } = await db
      .from("event_candidates")
      .select("id, title, summary, event_class, affected_sector, affected_region, risk_score, opportunity_score, last_updated_at")
      .or(sectors.length ? sectors.map((s) => `affected_sector.ilike.%${s}%`).join(",") : "affected_sector.not.is.null")
      .order("last_updated_at", { ascending: false })
      .limit(8);
    const pastLines = (pastEvents ?? []).filter((p) => p.id !== eventId).slice(0, 6).map((p) => `- ${p.title} [${p.event_class}, ${p.affected_sector ?? "?"}/${p.affected_region ?? "?"}] risk=${Number(p.risk_score).toFixed(2)} opp=${Number(p.opportunity_score).toFixed(2)} — ${(p.summary ?? "").slice(0, 200)}`);

    // Company graph relationships (competitors / suppliers)
    const relLines: string[] = [];

    const ev = eventRes.data;
    const impacts = (impactsRes.data ?? []) as Array<{ company_name: string; impact_type: string; impact_pathway: string; risk_score: number; opportunity_score: number; confidence: number; watch_signals: string[] | null }>;
    const opps = (oppsRes.data ?? []) as Array<{ title: string; opportunity_type: string; summary: string | null; buyer_pain: string | null; suggested_offer: string | null; urgency_score: number; commercial_value_score: number }>;
    const positioning = (positioningRes.data ?? []) as Array<{ title: string; user_type: string; how_it_could_be_used: string; positioning_angle: string | null; confidence: number }>;

    // === Build forensic prompt (Gartner/Kantar-grade) ===
    const system = `You are a senior market-intelligence analyst equivalent to a principal at Gartner, Kantar, NielsenIQ, Ipsos, AlphaSense and Forrester combined. You produce forensic-grade situation reports for institutional buyers.

Discipline:
- Base every claim on the supplied evidence and stated public context. Where you must reason, mark it clearly and hedge.
- Quantify wherever possible with explicit ranges and stated assumptions. Never invent a hard number.
- Present base / bear / bull cases with named drivers, not just percentages.
- Show causal chains at least three orders deep. Name mechanisms, not vibes.
- Provide a contrarian view — the strongest counter-narrative to your headline thesis.
- Flag data gaps and low-confidence assumptions explicitly.
- No financial advice. No "buy/sell/hold/price target". Positioning is described as *plays* buyers may consider, always with a hedge and monitoring signal.

Return ONLY valid JSON matching the exact keys shown in the user prompt. All array fields must be arrays (never null).`;

    const user = `SUBJECT (${data.subject_type}): ${subjectTitle}
Type: ${subjectType}
Sectors: ${sectors.join(", ") || "n/a"}
Regions: ${regions.join(", ") || "n/a"}

Subject summary:
${subjectSummary || "(none)"}

${ev ? `Underlying event candidate:
Title: ${ev.title}
Class: ${ev.event_class} · Severity: ${ev.severity} · Risk: ${Number(ev.risk_score).toFixed(2)} · Opp: ${Number(ev.opportunity_score).toFixed(2)} · Probability: ${Number(ev.probability).toFixed(2)} · Confidence: ${Number(ev.confidence).toFixed(2)}
Summary: ${ev.summary ?? ""}
` : ""}

Related opportunity cards on the same event:
${opps.map((o) => `- ${o.title} [${o.opportunity_type}] val=${Number(o.commercial_value_score).toFixed(2)} urg=${Number(o.urgency_score).toFixed(2)} — ${o.summary ?? ""}${o.buyer_pain ? " | pain: " + o.buyer_pain : ""}`).join("\n") || "(none)"}

Company impacts previously synthesised:
${impacts.map((i) => `- ${i.company_name} [${i.impact_type}] risk=${Number(i.risk_score).toFixed(2)} opp=${Number(i.opportunity_score).toFixed(2)} conf=${Number(i.confidence).toFixed(2)} — via: ${i.impact_pathway}${(i.watch_signals ?? []).length ? " | watch: " + (i.watch_signals ?? []).join("; ") : ""}`).join("\n") || "(none)"}

Historical / adjacent events on record:
${pastLines.join("\n") || "(none)"}

Entity graph relationships:
${relLines.join("\n") || "(none)"}

Existing strategic positioning notes:
${positioning.map((p) => `- ${p.title} [${p.user_type}] — ${p.how_it_could_be_used}${p.positioning_angle ? " | angle: " + p.positioning_angle : ""}`).join("\n") || "(none)"}

Underlying atomic evidence (traceable):
${evidenceLines.join("\n") || "(none — mark evidence_strength low)"}

TODAY'S DATE (reference): ${new Date().toISOString().slice(0, 10)}. Every timeline horizon MUST be phrased relative to TODAY — do not reference calendar events that have already passed. If the natural next inflection is a past-only recurring event (e.g. "pre-Christmas trading" when we are already in July looking forward), use the NEXT occurrence and say so explicitly.

TASK: Produce a forensic report as strict JSON with these keys (all required unless marked optional, arrays never null):

{
  "executive_summary": string (4-6 sentences, hedged, quantitative where possible),
  "headline_thesis": string (single sentence — the sharp analyst take),
  "layman_thesis": string (5-8 sentences in plain-English for a non-specialist reader: what this event actually is; why it has been flagged as a risk or opportunity; the chain of events that led to it and over what date range; who will be affected or in a position to capitalise and why; and what a prudent reader might do to position themselves to benefit or mitigate the consequences. No jargon. Hedged.),
  "quantitative_sizing": {
    "tam_view": string, "revenue_impact_range": string,
    "bear_case": string, "base_case": string, "bull_case": string,
    "confidence_band": string, "key_assumptions": string[] (3-6 items),
    "bull_triggers": string[] (3-5 — concrete signs / trigger events a reader should watch for that would push toward the BULL case, each with a named data source or observable),
    "bear_triggers": string[] (3-5 — concrete signs / trigger events a reader should watch for that would push toward the BEAR case, each with a named data source or observable)
  },
  "causal_chain": {
    "upstream_drivers": string[] (2-5), "trigger_event": string,
    "first_order_effects": string[] (3-6), "second_order_effects": string[] (3-6), "third_order_effects": string[] (2-4)
  },
  "exposure_map": {
    "beneficiaries": [{ "name": string, "kind": "company|sector|region|commodity", "magnitude": "low|moderate|high|severe", "reasoning": string }] (3-8),
    "harmed": [{ "name": string, "kind": string, "magnitude": string, "reasoning": string }] (2-6),
    "neutral_watch": [{ "name": string, "kind": string, "reasoning": string }] (0-4)
  },
  "historical_precedents": [{ "label": string, "period": string, "parallel": string, "outcome": string, "caveat": string }] (2-3),
  "contrarian_view": string (3-5 sentences, take the strongest opposite case),
  "data_gaps": string[] (3-6),
  "catalysts_and_watch_signals": [{ "signal": string, "leading_or_lagging": "leading|coincident|lagging", "cadence": string, "source_hint": string }] (4-8),
  "timeline": {
    "reference_date": string (today's date, ISO YYYY-MM-DD — MUST equal ${new Date().toISOString().slice(0, 10)}),
    "data_as_of": string (freshness statement, e.g. "evidence dated Jan–Jul 2026; most recent claim MM-DD"),
    "immediate_0_7d": string (must be things that could actually happen in the NEXT 7 days from the reference_date, not a past-season reference),
    "near_8_30d": string, "medium_1_3m": string, "strategic_3_12m": string,
    "inflection_points": string[] (2-4 — each dated relative to today, e.g. "next earnings ~ 2026-08-XX")
  },
  "risk_factors": string[] (3-6),
  "positioning_plays": [{ "archetype": "operator|allocator|insurer|policy|supplier|competitor|acquirer", "play": string, "hedge": string, "monitor": string }] (3-6),
  "final_synopsis": string (6-10 sentences — a comprehensive closing synthesis that pulls the whole journey together: what is potentially happening, why the invisible signs matter, who specifically to watch, and how a reader might position themselves to benefit or mitigate exposure. Hedged. Not financial advice.),
  "quality": {
    "evidence_strength": number 0..1, "source_diversity": number 0..1,
    "contradiction_pressure": number 0..1, "overall_confidence": number 0..1
  }
}`;

    // Log status: running
    await db.from("forensic_reports").upsert({
      subject_type: data.subject_type,
      subject_id: data.subject_id,
      status: "running",
      report: {},
      evidence_ids: evidenceIds,
    }, { onConflict: "subject_type,subject_id" });

    const res = await callJson<ForensicReport>({
      task: "report_synthesis",
      system,
      user,
      temperature: 0.25,
      maxTokens: 8192,
    });

    if (!res.ok || !res.data) {
      await db.from("forensic_reports").upsert({
        subject_type: data.subject_type,
        subject_id: data.subject_id,
        status: "failed",
        model: res.model,
        report: {},
        notes: res.error?.slice(0, 500) ?? "no data",
        evidence_ids: evidenceIds,
      }, { onConflict: "subject_type,subject_id" });
      return { ok: false, error: res.error ?? "Synthesis failed" };
    }

    const guard = guardFinancialAdvice(JSON.stringify(res.data));
    let scrubNote: string | null = null;
    if (!guard.ok) {
      scrubNote = `Guard flagged phrases: ${guard.violations.join(", ")}`;
      // Ask the model to rewrite to remove disallowed phrases
      const rewrite = await callAI<string>({
        task: "report_synthesis",
        system: "Rewrite the JSON so it contains none of these phrases: buy this stock, sell this stock, hold this stock, target price, guaranteed. Return the SAME JSON structure, only rewording offending strings. Return ONLY JSON.",
        user: JSON.stringify(res.data),
        json: true,
      });
      if (rewrite.ok && rewrite.raw) {
        try { res.data = JSON.parse(rewrite.raw) as ForensicReport; } catch { /* keep original */ }
      }
    }

    const conf = Number(res.data.quality?.overall_confidence ?? 0.5);
    await db.from("forensic_reports").upsert({
      subject_type: data.subject_type,
      subject_id: data.subject_id,
      status: "ok",
      model: res.model,
      report: JSON.parse(JSON.stringify(res.data)),
      evidence_ids: evidenceIds,
      confidence: conf,
      notes: scrubNote,
    }, { onConflict: "subject_type,subject_id" });

    return { ok: true, cached: false, model: res.model };
  });
