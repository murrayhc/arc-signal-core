// Red team + Analysis of Competing Hypotheses (ACH) for major events.
// Grounded strictly in the evidence already collected for the event
// (canonicals, lineage with the new stance-aware contradiction rows,
// impacts, belief_stress). Never invents external facts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { callJson, guardFinancialAdvice } from "./ai-gateway.server";

type DbAdmin = SupabaseClient<Database>;

async function admin(): Promise<DbAdmin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const AnalyseInput = z.object({ eventId: z.string().uuid() });

type Strength = "weak" | "moderate" | "strong";
type Ambiguity = "clear" | "contested" | "ambiguous";

interface Hypothesis {
  label: string;
  consistency: number;
  consistent: string[];
  inconsistent: string[];
}

function coerceStrength(v: unknown): Strength {
  return v === "weak" || v === "moderate" || v === "strong" ? v : "moderate";
}
function coerceAmbiguity(v: unknown): Ambiguity {
  return v === "clear" || v === "contested" || v === "ambiguous" ? v : "ambiguous";
}
function safeText(v: unknown, max = 2000): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  const g = guardFinancialAdvice(s);
  return (g.ok ? s : s.replace(/\b(buy|sell|hold)\b/gi, "consider")).slice(0, max);
}
function normaliseHypotheses(v: unknown): Hypothesis[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 4).map((h) => {
    const obj = (h ?? {}) as Record<string, unknown>;
    const raw = Number(obj.consistency);
    return {
      label: safeText(obj.label, 200) || "Unnamed hypothesis",
      consistency: Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.5,
      consistent: Array.isArray(obj.consistent)
        ? obj.consistent.slice(0, 6).map((x) => safeText(x, 240)).filter(Boolean)
        : [],
      inconsistent: Array.isArray(obj.inconsistent)
        ? obj.inconsistent.slice(0, 6).map((x) => safeText(x, 240)).filter(Boolean)
        : [],
    };
  });
}

interface Brief {
  eventTitle: string;
  eventSummary: string;
  severity: string | null;
  riskScore: number;
  confidence: number;
  probability: number;
  beliefStress: number | null;
  canonicals: Array<{
    id: string;
    text: string;
    reliability: number;
    contradictions: number;
    manipulation: number;
    supporting: Array<{ source: string; url: string | null }>;
    contradicting: Array<{ source: string; url: string | null }>;
  }>;
  impacts: Array<{ company: string; type: string | null; pathway: string | null; confidence: number }>;
}

async function buildBrief(db: DbAdmin, eventId: string): Promise<Brief | null> {
  const { data: ev } = await db
    .from("event_candidates")
    .select("id, title, summary, severity, risk_score, confidence, probability, primary_entity_id")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return null;

  const { data: impactsRaw } = await db
    .from("company_impacts")
    .select("company_name, impact_type, impact_pathway, confidence, evidence_ids")
    .eq("event_candidate_id", eventId);
  const impacts = (impactsRaw ?? []).slice(0, 12).map((i) => ({
    company: i.company_name,
    type: i.impact_type,
    pathway: (i.impact_pathway ?? "").slice(0, 300),
    confidence: Number(i.confidence ?? 0),
  }));

  const atomicIds = Array.from(new Set(
    (impactsRaw ?? []).flatMap((i) => (i.evidence_ids ?? []) as string[]),
  )).slice(0, 60);
  const canonicals: Brief["canonicals"] = [];
  if (atomicIds.length) {
    const { data: atomics } = await db
      .from("atomic_claims")
      .select("canonical_claim_id")
      .in("id", atomicIds);
    const canIds = Array.from(new Set(
      (atomics ?? []).map((a) => a.canonical_claim_id).filter((x): x is string => !!x),
    )).slice(0, 20);
    if (canIds.length) {
      const [cansRes, linRes] = await Promise.all([
        db.from("canonical_claims")
          .select("id, claim_text, reliability_score, contradiction_count, manipulation_risk_score, repeat_count")
          .in("id", canIds),
        db.from("claim_lineage")
          .select("canonical_claim_id, source_id, url, relation_to_origin")
          .in("canonical_claim_id", canIds),
      ]);
      const srcIds = Array.from(new Set(((linRes.data ?? []) as Array<{ source_id: string | null }>).map((l) => l.source_id).filter((x): x is string => !!x)));
      const srcNames = new Map<string, string>();
      if (srcIds.length) {
        const { data: srcs } = await db.from("sources").select("id, name").in("id", srcIds);
        for (const s of srcs ?? []) srcNames.set(s.id, s.name);
      }
      type LinRow = { canonical_claim_id: string; source_id: string | null; url: string | null; relation_to_origin: string | null };
      const linByCan = new Map<string, LinRow[]>();
      for (const l of ((linRes.data ?? []) as LinRow[])) {
        const arr = linByCan.get(l.canonical_claim_id) ?? [];
        arr.push(l);
        linByCan.set(l.canonical_claim_id, arr);
      }
      const ranked = (cansRes.data ?? []).slice().sort((a, b) => (Number(b.repeat_count ?? 0) - Number(a.repeat_count ?? 0)));
      for (const can of ranked.slice(0, 8)) {
        const rows = linByCan.get(can.id) ?? [];
        const supporting = rows
          .filter((r) => r.relation_to_origin !== "contradiction" && r.relation_to_origin !== "neutral")
          .slice(0, 6)
          .map((r) => ({ source: srcNames.get(r.source_id ?? "") ?? "unknown", url: r.url }));
        const contradicting = rows
          .filter((r) => r.relation_to_origin === "contradiction")
          .slice(0, 6)
          .map((r) => ({ source: srcNames.get(r.source_id ?? "") ?? "unknown", url: r.url }));
        canonicals.push({
          id: can.id,
          text: can.claim_text,
          reliability: Number(can.reliability_score ?? 0),
          contradictions: Number(can.contradiction_count ?? 0),
          manipulation: Number(can.manipulation_risk_score ?? 0),
          supporting,
          contradicting,
        });
      }
    }
  }

  let beliefStress: number | null = null;
  if (ev.primary_entity_id) {
    const { data: entRow } = await db
      .from("entities")
      .select("belief_stress")
      .eq("id", ev.primary_entity_id)
      .maybeSingle();
    if (entRow?.belief_stress != null) beliefStress = Number(entRow.belief_stress);
  }

  return {
    eventTitle: ev.title ?? "",
    eventSummary: (ev.summary ?? "").slice(0, 1200),
    severity: ev.severity,
    riskScore: Number(ev.risk_score ?? 0),
    confidence: Number(ev.confidence ?? 0),
    probability: Number(ev.probability ?? 0),
    beliefStress,
    canonicals,
    impacts,
  };
}

function briefToPrompt(brief: Brief): string {
  const canons = brief.canonicals.map((c, i) =>
    `[C${i + 1}] "${c.text.slice(0, 240)}"\n` +
    `    reliability=${c.reliability.toFixed(2)} contradictions=${c.contradictions} manipulation=${c.manipulation.toFixed(2)}\n` +
    `    supporting (${c.supporting.length}): ${c.supporting.map((s) => s.source).join(", ") || "—"}\n` +
    `    contradicting (${c.contradicting.length}): ${c.contradicting.map((s) => s.source).join(", ") || "—"}`
  ).join("\n");
  const imps = brief.impacts.map((i) =>
    `- ${i.company} · ${i.type ?? "?"} · conf ${i.confidence.toFixed(2)} · ${i.pathway || ""}`
  ).join("\n");
  return (
    `EVENT: ${brief.eventTitle}\n` +
    `SUMMARY: ${brief.eventSummary}\n` +
    `severity=${brief.severity ?? "?"} risk=${brief.riskScore.toFixed(2)} confidence=${brief.confidence.toFixed(2)} probability=${brief.probability.toFixed(2)}` +
    (brief.beliefStress != null ? ` belief_stress=${brief.beliefStress.toFixed(2)}` : "") + "\n\n" +
    `CANONICAL CLAIMS + LINEAGE:\n${canons || "(none)"}\n\n` +
    `COMPANY IMPACTS:\n${imps || "(none)"}`
  );
}

export const analyseEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AnalyseInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const brief = await buildBrief(db, data.eventId);
    if (!brief) return { ok: false, error: "Event not found" };
    const evidence = briefToPrompt(brief);

    // ---- RED TEAM ----
    const redPrompt =
      `${evidence}\n\n` +
      `Build the STRONGEST honest case that this event's main judgment is wrong, ` +
      `overstated, or misread. Lead with contradicting evidence and weakest links (low reliability, high manipulation risk, thin sourcing, single-source claims, plausible benign readings). ` +
      `If the case against is genuinely weak, say so plainly.\n\n` +
      `Return STRICT JSON: {"red_team_case": string, "red_team_strength": "weak"|"moderate"|"strong"}. ` +
      `Use only the evidence above. Do not invent external facts.`;
    const red = await callJson<{ red_team_case?: string; red_team_strength?: string }>({
      task: "contradiction_analysis",
      system:
        "You are a red team analyst. Using ONLY the provided evidence, build the STRONGEST honest case that this event's main judgment is wrong, overstated, or misread — lead with the contradicting evidence and the weakest links. Do not strawman or invent. If the case against is genuinely weak, say so plainly. Also rate the case against as weak, moderate, or strong. Do NOT give financial advice: no buy/sell/hold, no target price, no portfolio allocation.",
      user: redPrompt,
      temperature: 0.2,
      maxTokens: 900,
    });
    const redTeamCase = red.ok && red.data ? safeText(red.data.red_team_case, 4000) : "";
    const redTeamStrength: Strength = red.ok && red.data ? coerceStrength(red.data.red_team_strength) : "moderate";

    // ---- ACH ----
    const achPrompt =
      `${evidence}\n\n` +
      `List 2–4 competing explanations for what is really happening (e.g. genuine event vs routine/benign vs coordinated narrative vs data artefact). ` +
      `For each note which evidence is consistent and inconsistent. Identify the most-consistent (leading) hypothesis, whether the evidence between them is clear, contested, or ambiguous, and the single piece of evidence that would most discriminate.\n\n` +
      `Return STRICT JSON: {"hypotheses":[{"label":string,"consistency":0..1,"consistent":string[],"inconsistent":string[]}], "leading":string, "ambiguity":"clear"|"contested"|"ambiguous", "discriminating_evidence":string}. ` +
      `Use only the evidence above. Do not invent external facts.`;
    const ach = await callJson<{
      hypotheses?: unknown;
      leading?: string;
      ambiguity?: string;
      discriminating_evidence?: string;
    }>({
      task: "contradiction_analysis",
      system:
        "You are an intelligence analyst applying Analysis of Competing Hypotheses. Grounded strictly in the provided evidence, enumerate 2–4 competing explanations, mark which evidence is consistent / inconsistent with each, identify the most-consistent leading hypothesis, judge whether the evidence between them is clear / contested / ambiguous, and name the single piece of evidence that would most discriminate. Do NOT invent external facts. Do NOT give financial advice.",
      user: achPrompt,
      temperature: 0.2,
      maxTokens: 1400,
    });
    const hypotheses = ach.ok && ach.data ? normaliseHypotheses(ach.data.hypotheses) : [];
    const leading = ach.ok && ach.data ? safeText(ach.data.leading, 400) : "";
    const ambiguity: Ambiguity = ach.ok && ach.data ? coerceAmbiguity(ach.data.ambiguity) : "ambiguous";
    const discriminating = ach.ok && ach.data ? safeText(ach.data.discriminating_evidence, 800) : "";

    const nowIso = new Date().toISOString();
    const { data: existing } = await db
      .from("event_analysis")
      .select("id")
      .eq("event_candidate_id", data.eventId)
      .maybeSingle();
    if (existing) {
      await db.from("event_analysis").update({
        red_team_case: redTeamCase || null,
        red_team_strength: redTeamCase ? redTeamStrength : null,
        hypotheses: hypotheses as unknown as Database["public"]["Tables"]["event_analysis"]["Update"]["hypotheses"],
        leading_hypothesis: leading || null,
        evidence_ambiguity: hypotheses.length ? ambiguity : null,
        discriminating_evidence: discriminating || null,
        analysed_at: nowIso,
      }).eq("id", existing.id);
    } else {
      await db.from("event_analysis").insert({
        event_candidate_id: data.eventId,
        red_team_case: redTeamCase || null,
        red_team_strength: redTeamCase ? redTeamStrength : null,
        hypotheses: hypotheses as unknown as Database["public"]["Tables"]["event_analysis"]["Insert"]["hypotheses"],
        leading_hypothesis: leading || null,
        evidence_ambiguity: hypotheses.length ? ambiguity : null,
        discriminating_evidence: discriminating || null,
        analysed_at: nowIso,
      });
    }

    return {
      ok: true,
      red_team_case: redTeamCase,
      red_team_strength: redTeamStrength,
      hypotheses,
      leading,
      ambiguity,
      discriminating_evidence: discriminating,
    };
  });

export const getEventAnalysis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AnalyseInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db
      .from("event_analysis")
      .select("*")
      .eq("event_candidate_id", data.eventId)
      .maybeSingle();
    return { analysis: row ?? null };
  });

// Bounded, non-fatal auto-run for the top N events of a scan.
export async function autoAnalyseTopEvents(opts: { scanRunId?: string | null; max?: number } = {}): Promise<{ analysed: number; notes: string[] }> {
  const notes: string[] = [];
  const max = Math.max(1, Math.min(5, opts.max ?? 3));
  try {
    const db = await admin();
    let query = db
      .from("event_candidates")
      .select("id, risk_score, severity, created_from_scan_run_id")
      .order("risk_score", { ascending: false })
      .limit(max);
    if (opts.scanRunId) query = query.eq("created_from_scan_run_id", opts.scanRunId);
    const { data: evs } = await query;
    let analysed = 0;
    for (const ev of evs ?? []) {
      try {
        const r = await analyseEvent({ data: { eventId: ev.id } });
        if (r.ok) analysed++;
      } catch (err) {
        notes.push(`Auto-analyse failed for event ${ev.id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (analysed) notes.push(`Red-team + ACH analysed ${analysed} top event(s).`);
    return { analysed, notes };
  } catch (err) {
    notes.push(`Auto-analyse skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { analysed: 0, notes };
  }
}
