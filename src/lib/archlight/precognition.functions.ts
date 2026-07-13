// Precognition layer: forward scenarios, impact propagation across entity_relationships,
// per-company deep exposure, and rolling weekly digest.

import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "@/lib/archlight/owner-auth.server";
import { z } from "zod";
import { callJson, guardFinancialAdvice } from "./ai-gateway.server";
import { resolveOne, type EntityRow, type ResolvedEntity } from "./resolver.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const IdInput = z.object({ id: z.string().uuid() });

// ============================================================
// Scenario projection: 4 horizons per event with probability, magnitude,
// affected cohorts, mechanism, leading indicators, contradicting signals.
// ============================================================
const HORIZONS = ["immediate", "near", "medium", "strategic"] as const;
const HORIZON_LABEL: Record<(typeof HORIZONS)[number], string> = {
  immediate: "0-7 days",
  near: "8-30 days",
  medium: "1-3 months",
  strategic: "3-12 months",
};

async function loadEntities(db: Awaited<ReturnType<typeof admin>>): Promise<EntityRow[]> {
  const { data } = await db.from("entities").select("id, canonical_name, ticker, sector, region, aliases, entity_type").eq("entity_type", "company").limit(5000);
  return (data ?? []) as EntityRow[];
}

/**
 * Generate + persist forward scenarios for a single event across 4 horizons,
 * and propagate impact to supplier/customer/competitor/peer companies via
 * entity_relationships (only if the impact isn't already recorded).
 */
export const projectEventForward = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();

    const [{ data: ev }, { data: impacts }, entities] = await Promise.all([
      db.from("event_candidates").select("*").eq("id", data.id).maybeSingle(),
      db.from("company_impacts").select("*").eq("event_candidate_id", data.id),
      loadEntities(db),
    ]);
    if (!ev) throw new Error("event not found");

    // --- Resolve primary companies mentioned in impacts to entities ---
    const primaryResolved: ResolvedEntity[] = [];
    for (const im of impacts ?? []) {
      const r = resolveOne(im.company_name, entities);
      if (r) primaryResolved.push(r);
    }
    const primaryIds = Array.from(new Set(primaryResolved.map((r) => r.id)));

    // --- Propagate to related entities (1 hop) ---
    const propagated: Array<{ from_id: string; to_id: string; rel: string; weight: number; rationale: string | null; verified: boolean }> = [];
    if (primaryIds.length) {
      const { data: rels } = await db.from("entity_relationships").select("*").in("from_entity_id", primaryIds);
      for (const rel of rels ?? []) {
        propagated.push({ from_id: rel.from_entity_id, to_id: rel.to_entity_id, rel: rel.relationship_type, weight: Number(rel.weight), rationale: rel.rationale, verified: !!rel.verified });
      }
      // also incoming (peer/competitor of X → X)
      const { data: relsIn } = await db.from("entity_relationships").select("*").in("to_entity_id", primaryIds);
      for (const rel of relsIn ?? []) {
        propagated.push({ from_id: rel.to_entity_id, to_id: rel.from_entity_id, rel: rel.relationship_type, weight: Number(rel.weight), rationale: rel.rationale, verified: !!rel.verified });
      }
    }
    // When multiple edges cover the same (from,to,rel), keep the verified one.
    {
      const bestByKey = new Map<string, typeof propagated[number]>();
      for (const p of propagated) {
        const key = `${p.from_id}|${p.to_id}|${p.rel}`;
        const prev = bestByKey.get(key);
        if (!prev || (p.verified && !prev.verified)) bestByKey.set(key, p);
      }
      propagated.length = 0;
      for (const v of bestByKey.values()) propagated.push(v);
    }


    // Load propagated entities
    const propIds = Array.from(new Set(propagated.map((p) => p.to_id))).filter((id) => !primaryIds.includes(id));
    const propEntities: EntityRow[] = propIds.length
      ? (((await db.from("entities").select("id, canonical_name, ticker, sector, region, aliases, entity_type").in("id", propIds)).data ?? []) as EntityRow[])
      : [];
    const propByName = propEntities.map((e) => ({ entity: e, links: propagated.filter((p) => p.to_id === e.id) }));

    // --- Insert propagated company_impacts (skip if already present by name) ---
    const existingNames = new Set((impacts ?? []).map((i) => i.company_name.toLowerCase()));
    const propagatedInserts: Array<{ company: string; type: string; pathway: string; risk: number; opp: number; conf: number }> = [];
    for (const p of propByName) {
      if (existingNames.has(p.entity.canonical_name.toLowerCase())) continue;
      const strongestLink = p.links.sort((a, b) => b.weight - a.weight)[0];
      const decay = strongestLink.weight * 0.7; // one-hop decay
      const relType = strongestLink.rel;
      const impact_type =
        relType === "supplier" ? "exposed" :
        relType === "customer" ? "exposed" :
        relType === "competitor" ? "beneficiary" :
        relType === "peer" ? "watch_only" :
        "watch_only";
      const primaryImpact = (impacts ?? []).find((im) => resolveOne(im.company_name, entities)?.id === strongestLink.from_id);
      const baseRisk = primaryImpact ? Number(primaryImpact.risk_score) : Number(ev.risk_score);
      const baseOpp = primaryImpact ? Number(primaryImpact.opportunity_score) : Number(ev.opportunity_score);
      const baseConf = primaryImpact ? Number(primaryImpact.confidence) : Number(ev.confidence);
      // Competitors of a harmed company gain opportunity; suppliers of a harmed customer face risk
      const swapForCompetitor = relType === "competitor" && primaryImpact?.impact_type === "harmed";
      const risk = swapForCompetitor ? baseOpp * decay : baseRisk * decay;
      const opp = swapForCompetitor ? baseRisk * decay : baseOpp * decay;
      const pathway = `${p.entity.canonical_name} may be ${impact_type} as ${relType} of ${propEntities.length ? (entities.find((e) => e.id === strongestLink.from_id)?.canonical_name ?? "primary company") : "primary company"}${strongestLink.rationale ? ` — ${strongestLink.rationale}` : ""}.`;
      propagatedInserts.push({ company: p.entity.canonical_name, type: impact_type, pathway, risk, opp, conf: baseConf * 0.75 });
      await db.from("company_impacts").insert({
        event_candidate_id: data.id,
        company_name: p.entity.canonical_name,
        impact_type,
        impact_pathway: pathway,
        confidence: Math.max(0, Math.min(1, baseConf * 0.75)),
        risk_score: Math.max(0, Math.min(1, risk)),
        opportunity_score: Math.max(0, Math.min(1, opp)),
        watch_signals: [`${relType} link`, `decay ${decay.toFixed(2)}`],
        metadata: { propagated: true, from_entity_id: strongestLink.from_id, relationship_type: relType, decay },
      });
    }

    // --- LLM: forward scenarios across 4 horizons ---
    const impactSnippet = (impacts ?? []).map((i) => `${i.company_name} (${i.impact_type}): ${i.impact_pathway}`).join("\n");
    const propSnippet = propagatedInserts.map((p) => `${p.company} (${p.type}, propagated): ${p.pathway}`).join("\n");
    const scen = await callJson<{ scenarios: Array<{ horizon: string; scenario_label: string; narrative: string; mechanism: string; probability: number; magnitude: string; affected_companies: string[]; affected_sectors: string[]; affected_regions: string[]; affected_cohorts: string[]; leading_indicators: string[]; contradicting_signals: string[]; confidence: number }> }>({
      task: "future_scenarios",
      system: "You are Arklight's forward-projection engine. Given a public-signal event, produce ONE scenario for each of these four horizons: immediate (0-7 days), near (8-30 days), medium (1-3 months), strategic (3-12 months). For each scenario include a short label, a 2-3 sentence narrative, the causal mechanism, probability 0..1, magnitude (minor|moderate|material|severe|systemic), affected companies (real names or tickers if known), affected sectors, affected regions, affected cohorts (retail_consumers|institutional_investors|small_business|governments|workers|patients|households as a bounded list), 3 leading indicators to watch, and 2 signals that would contradict the scenario. Be hedged (may, could, appears). NEVER give financial advice: no buy/sell/hold, no target price, no portfolio allocation. Return strict JSON: {scenarios:[{horizon,scenario_label,narrative,mechanism,probability,magnitude,affected_companies,affected_sectors,affected_regions,affected_cohorts,leading_indicators,contradicting_signals,confidence}]}. Horizon must be one of immediate|near|medium|strategic.",
      user: `Event: ${ev.title}\nClass: ${ev.event_class} · severity ${ev.severity} · risk ${Number(ev.risk_score).toFixed(2)} · opp ${Number(ev.opportunity_score).toFixed(2)} · conf ${Number(ev.confidence).toFixed(2)}\nSector: ${ev.affected_sector ?? "?"} · Region: ${ev.affected_region ?? "?"}\nSummary: ${ev.summary ?? ""}\n\nPrimary impacts:\n${impactSnippet || "(none synthesized yet)"}\n\nPropagated (via supplier/competitor graph):\n${propSnippet || "(none)"}\n\nProduce exactly 4 scenarios (one per horizon).`,
    });

    // Delete existing scenarios for this event to avoid duplicates on re-run.
    await db.from("scenario_projections").delete().eq("event_candidate_id", data.id);

    const inserted: string[] = [];
    if (scen.ok && scen.data?.scenarios) {
      for (const s of scen.data.scenarios) {
        const guard = guardFinancialAdvice(`${s.scenario_label} ${s.narrative} ${s.mechanism}`);
        if (!guard.ok) continue;
        const horizon = (HORIZONS as readonly string[]).includes(s.horizon) ? s.horizon : "near";
        const mag = ["minor","moderate","material","severe","systemic"].includes(s.magnitude) ? s.magnitude : "moderate";
        const { data: row } = await db.from("scenario_projections").insert({
          event_candidate_id: data.id,
          horizon,
          scenario_label: s.scenario_label.slice(0, 200),
          narrative: s.narrative,
          mechanism: s.mechanism,
          probability: Math.max(0, Math.min(1, Number(s.probability))),
          magnitude: mag,
          affected_companies: (s.affected_companies ?? []).slice(0, 12),
          affected_sectors: (s.affected_sectors ?? []).slice(0, 8),
          affected_regions: (s.affected_regions ?? []).slice(0, 8),
          affected_cohorts: (s.affected_cohorts ?? []).slice(0, 6),
          leading_indicators: (s.leading_indicators ?? []).slice(0, 6),
          contradicting_signals: (s.contradicting_signals ?? []).slice(0, 4),
          confidence: Math.max(0, Math.min(1, Number(s.confidence))),
          model: scen.model,
        }).select("id").single();
        if (row) inserted.push(row.id);
      }
    }

    // --- Refresh company_exposures rollup for touched companies ---
    const touched = Array.from(new Set([
      ...(impacts ?? []).map((i) => i.company_name),
      ...propagatedInserts.map((p) => p.company),
    ]));
    for (const name of touched) {
      await refreshCompanyExposure(db, name, entities);
    }

    return {
      event_id: data.id,
      scenarios_created: inserted.length,
      propagated_impacts: propagatedInserts.length,
      propagated_to: propagatedInserts.map((p) => p.company),
      resolver: {
        primary_resolved: primaryResolved.map((r) => ({ mention_name: r.canonical_name, ticker: r.ticker, sector: r.sector, matched_on: r.matched_on, score: r.match_score })),
      },
    };
  });

async function refreshCompanyExposure(db: Awaited<ReturnType<typeof admin>>, name: string, entities: EntityRow[]) {
  const { data: rows } = await db.from("company_impacts").select("risk_score, opportunity_score, confidence, impact_pathway, event_candidate_id, updated_at").ilike("company_name", name);
  if (!rows || !rows.length) return;
  const eventIds = Array.from(new Set(rows.map((r) => r.event_candidate_id).filter((x): x is string => !!x)));
  const [{ data: scenarios }] = await Promise.all([
    eventIds.length ? db.from("scenario_projections").select("scenario_label").in("event_candidate_id", eventIds).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const netRisk = rows.reduce((a, r) => a + Number(r.risk_score), 0) / rows.length;
  const netOpp = rows.reduce((a, r) => a + Number(r.opportunity_score), 0) / rows.length;
  const weightedConf = rows.reduce((a, r) => a + Number(r.confidence), 0) / rows.length;
  const topPathways = rows.slice(0, 6).map((r) => (r.impact_pathway ?? "").slice(0, 160));
  const topScenarios = (scenarios ?? []).slice(0, 6).map((s: { scenario_label: string }) => s.scenario_label);
  const lastAt = rows.map((r) => r.updated_at).sort().reverse()[0] ?? null;
  const resolved = resolveOne(name, entities);
  await db.from("company_exposures").upsert({
    entity_id: resolved?.id ?? null,
    company_name: name,
    ticker: resolved?.ticker ?? null,
    sector: resolved?.sector ?? null,
    region: resolved?.region ?? null,
    event_count: eventIds.length,
    net_risk: Math.max(0, Math.min(1, netRisk)),
    net_opportunity: Math.max(0, Math.min(1, netOpp)),
    weighted_confidence: Math.max(0, Math.min(1, weightedConf)),
    top_pathways: topPathways,
    top_scenarios: topScenarios,
    last_event_at: lastAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_name" });
}

// ============================================================
// Bulk precognition: project the top N most-recent events forward.
// ============================================================
const BulkInput = z.object({ limit: z.number().int().min(1).max(30).default(8) });
export const projectRecentEvents = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => BulkInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    // Pick events that don't yet have scenarios, ordered by (risk+opp)*confidence desc.
    const { data: existing } = await db.from("scenario_projections").select("event_candidate_id");
    const done = new Set((existing ?? []).map((e) => e.event_candidate_id));
    const { data: events } = await db.from("event_candidates").select("id, risk_score, opportunity_score, confidence, last_updated_at").order("last_updated_at", { ascending: false }).limit(40);
    const queue = (events ?? [])
      .filter((e) => !done.has(e.id))
      .sort((a, b) => ((Number(b.risk_score) + Number(b.opportunity_score)) * Number(b.confidence)) - ((Number(a.risk_score) + Number(a.opportunity_score)) * Number(a.confidence)))
      .slice(0, data.limit);
    const results: Array<{ event_id: string; scenarios: number; propagated: number }> = [];
    for (const ev of queue) {
      try {
        const out = await projectEventForward({ data: { id: ev.id } });
        results.push({ event_id: ev.id, scenarios: out.scenarios_created, propagated: out.propagated_impacts });
      } catch (err) {
        results.push({ event_id: ev.id, scenarios: 0, propagated: 0 });
      }
    }
    return { processed: results.length, results };
  });

// ============================================================
// Event scenarios (read)
// ============================================================
export const getEventScenarios = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db.from("scenario_projections").select("*").eq("event_candidate_id", data.id).order("horizon", { ascending: true });
    return { scenarios: rows ?? [], horizon_labels: HORIZON_LABEL };
  });

// ============================================================
// Company deep exposure (real page)
// ============================================================
const NameInput = z.object({ name: z.string().min(1).max(240) });
export const getCompanyDeep = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => NameInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: entity }, { data: impacts }, { data: exposure }] = await Promise.all([
      db.from("entities").select("*").eq("entity_type", "company").ilike("canonical_name", data.name).maybeSingle(),
      db.from("company_impacts").select("*").ilike("company_name", data.name).order("updated_at", { ascending: false }).limit(80),
      db.from("company_exposures").select("*").ilike("company_name", data.name).maybeSingle(),
    ]);

    const eventIds = Array.from(new Set((impacts ?? []).map((i) => i.event_candidate_id).filter((x): x is string => !!x)));
    const [{ data: events }, { data: scenarios }] = await Promise.all([
      eventIds.length ? db.from("event_candidates").select("id, title, event_class, severity, risk_score, opportunity_score, confidence, affected_sector, affected_region, last_updated_at, summary").in("id", eventIds).order("last_updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
      eventIds.length ? db.from("scenario_projections").select("*").in("event_candidate_id", eventIds).order("horizon", { ascending: true }) : Promise.resolve({ data: [] }),
    ]);

    // Peer / supplier / competitor network
    let related: Array<{ id: string; canonical_name: string; ticker: string | null; sector: string | null; relationship_type: string; weight: number; rationale: string | null; direction: "outgoing" | "incoming" }> = [];
    if (entity?.id) {
      const [{ data: out }, { data: incoming }] = await Promise.all([
        db.from("entity_relationships").select("relationship_type, weight, rationale, to_entity_id").eq("from_entity_id", entity.id),
        db.from("entity_relationships").select("relationship_type, weight, rationale, from_entity_id").eq("to_entity_id", entity.id),
      ]);
      const ids = Array.from(new Set([
        ...(out ?? []).map((r) => r.to_entity_id as string),
        ...(incoming ?? []).map((r) => r.from_entity_id as string),
      ]));
      const { data: peers } = ids.length ? await db.from("entities").select("id, canonical_name, ticker, sector").in("id", ids) : { data: [] };
      const peerMap = new Map((peers ?? []).map((p) => [p.id, p]));
      for (const r of out ?? []) {
        const p = peerMap.get(r.to_entity_id);
        if (p) related.push({ id: p.id, canonical_name: p.canonical_name, ticker: p.ticker, sector: p.sector, relationship_type: r.relationship_type, weight: Number(r.weight), rationale: r.rationale, direction: "outgoing" });
      }
      for (const r of incoming ?? []) {
        const p = peerMap.get(r.from_entity_id);
        if (p) related.push({ id: p.id, canonical_name: p.canonical_name, ticker: p.ticker, sector: p.sector, relationship_type: r.relationship_type, weight: Number(r.weight), rationale: r.rationale, direction: "incoming" });
      }
    }

    return {
      name: data.name,
      entity: entity ?? null,
      exposure: exposure ?? null,
      impacts: impacts ?? [],
      events: events ?? [],
      scenarios: scenarios ?? [],
      related,
    };
  });

// ============================================================
// Weekly digest — generate + read
// ============================================================
export const generateDigest = createServerFn({ method: "POST" }).middleware([requireOwner]).handler(async () => {
  const db = await admin();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 3600 * 1000);

  const [{ data: events }, { data: scenarios }, { data: opps }, { data: impacts }] = await Promise.all([
    db.from("event_candidates").select("id, title, event_class, severity, risk_score, opportunity_score, confidence, affected_sector, affected_region, summary, last_updated_at").gte("last_updated_at", windowStart.toISOString()).order("last_updated_at", { ascending: false }).limit(60),
    db.from("scenario_projections").select("*").gte("created_at", windowStart.toISOString()).order("probability", { ascending: false }).limit(60),
    db.from("opportunity_cards").select("id, title, opportunity_type, summary, commercial_value_score, urgency_score, confidence, event_candidate_id").gte("updated_at", windowStart.toISOString()).order("commercial_value_score", { ascending: false }).limit(30),
    db.from("company_impacts").select("id, company_name, impact_type, risk_score, opportunity_score, confidence, event_candidate_id, updated_at").gte("updated_at", windowStart.toISOString()).order("updated_at", { ascending: false }).limit(120),
  ]);

  // Rank events by (risk + opp) * confidence * evidence weight
  const ranked = (events ?? []).map((e) => ({
    ...e,
    _score: (Number(e.risk_score) + Number(e.opportunity_score)) * Number(e.confidence),
  })).sort((a, b) => b._score - a._score);

  const topRisks = ranked.filter((e) => e.event_class === "risk" || e.event_class === "mixed").slice(0, 6);
  const topOpps = ranked.filter((e) => e.event_class === "opportunity" || e.event_class === "mixed").slice(0, 6);

  // LLM: headline + summary + why-it-matters
  const brief = await callJson<{ headline: string; summary: string; why_it_matters: string[] }>({
    task: "report_synthesis",
    system: "You are Arklight's weekly digest editor. Given a list of ranked events, top opportunities and impacts from the past 7 days, produce: (1) a single-sentence headline (< 90 chars, no clickbait), (2) a 3-4 sentence summary that names the concrete forces at play across sectors and regions, and (3) 4-6 bullet 'why it matters' points aimed at a decision-maker. Be hedged (may, could, appears). NEVER give financial advice — no buy/sell/hold, no target price, no portfolio allocation. Return JSON: {headline,summary,why_it_matters:string[]}.",
    user: `Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}\n\nTop risks:\n${topRisks.map((e) => `- ${e.title} (${e.affected_sector ?? "?"}) risk ${Number(e.risk_score).toFixed(2)}`).join("\n")}\n\nTop opportunities:\n${topOpps.map((e) => `- ${e.title} (${e.affected_sector ?? "?"}) opp ${Number(e.opportunity_score).toFixed(2)}`).join("\n")}\n\nTop scenarios:\n${(scenarios ?? []).slice(0, 10).map((s) => `- [${s.horizon}] ${s.scenario_label} p=${Number(s.probability).toFixed(2)} mag=${s.magnitude}`).join("\n")}`,
  });

  const guard = guardFinancialAdvice(JSON.stringify(brief.data ?? {}));
  const headline = guard.ok && brief.data ? brief.data.headline : "Weekly public-signal digest";
  const summary = guard.ok && brief.data ? brief.data.summary : "Digest available; guardrail rejected LLM narrative — showing raw ranked signals only.";
  const why = guard.ok && brief.data ? brief.data.why_it_matters : [];

  const { data: snap } = await db.from("digest_snapshots").insert({
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    headline: headline.slice(0, 200),
    summary,
    top_risks: topRisks as unknown as never,
    top_opportunities: topOpps as unknown as never,
    top_scenarios: (scenarios ?? []).slice(0, 10) as unknown as never,
    ranked_events: ranked.slice(0, 20) as unknown as never,
    model: brief.model,
  }).select().single();

  return {
    digest: snap,
    why_it_matters: why,
    counts: {
      events: (events ?? []).length,
      scenarios: (scenarios ?? []).length,
      opportunities: (opps ?? []).length,
      impacts: (impacts ?? []).length,
    },
  };
});

export const getLatestDigest = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("digest_snapshots").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { digest: data ?? null };
});

export const getDigestHistory = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("digest_snapshots").select("id, window_start, window_end, headline, summary, created_at").order("created_at", { ascending: false }).limit(20);
  return { digests: data ?? [] };
});

// ============================================================
// Universe listing (company_exposures — for enhanced companies page)
// ============================================================
export const getCompanyUniverse = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("company_exposures").select("*").order("last_event_at", { ascending: false }).limit(500);
  return { companies: data ?? [] };
});

// ============================================================
// Chart data: resolve a subject to a primary ticker + top 3 competitor tickers
// ============================================================
const ChartInput = z.object({ query: z.string().min(1).max(200) });

const TV_SUFFIX_EXCHANGE: Record<string, string> = {
  L: "LSE", PA: "EURONEXT", DE: "XETR", T: "TSE", HK: "HKEX", AX: "ASX",
  TO: "TSX", NS: "NSE", SW: "SIX", MI: "MIL", MC: "BME", AS: "EURONEXT",
};

const TV_EXACT: Record<string, string> = {
  AAPL: "NASDAQ:AAPL",
  MAN: "NYSE:MAN",
  BA: "NYSE:BA",
  GD: "NYSE:GD",
  LHX: "NYSE:LHX",
  LMT: "NYSE:LMT",
  NOC: "NYSE:NOC",
  RTX: "NYSE:RTX",
};

function toTradingViewSymbol(ticker: string | null): string | null {
  if (!ticker) return null;
  const raw = ticker.trim().toUpperCase();
  if (!raw) return null;
  if (raw.includes(":")) return raw;
  if (TV_EXACT[raw]) return TV_EXACT[raw];
  const [base, suffix] = raw.split(".");
  if (suffix && TV_SUFFIX_EXCHANGE[suffix]) return `${TV_SUFFIX_EXCHANGE[suffix]}:${base}`;
  return raw;
}

export const getChartTickers = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => ChartInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const q = data.query.trim();
    // Load full company universe — the resolver handles punctuation, aliases,
    // and fuzzy matches better than a narrow ilike prefilter.
    const entities = await loadEntities(db);
    const resolved = resolveOne(q, entities);
    const primarySymbol = toTradingViewSymbol(resolved?.ticker ?? null);
    if (!resolved?.ticker || !primarySymbol) return { primary: null, competitors: [] as Array<{ name: string; ticker: string }> };

    // Find competitors via entity_relationships
    const [{ data: out }, { data: incoming }] = await Promise.all([
      db.from("entity_relationships").select("weight, to_entity_id").eq("from_entity_id", resolved.id).eq("relationship_type", "competitor"),
      db.from("entity_relationships").select("weight, from_entity_id").eq("to_entity_id", resolved.id).eq("relationship_type", "competitor"),
    ]);
    const compIds = Array.from(new Set([
      ...(out ?? []).map((r) => r.to_entity_id as string),
      ...(incoming ?? []).map((r) => r.from_entity_id as string),
    ]));
    let competitors: Array<{ name: string; ticker: string; weight: number }> = [];
    if (compIds.length) {
      const { data: peers } = await db.from("entities").select("id, canonical_name, ticker").in("id", compIds);
      const weightMap = new Map<string, number>();
      for (const r of out ?? []) weightMap.set(r.to_entity_id as string, Number(r.weight));
      for (const r of incoming ?? []) {
        const k = r.from_entity_id as string;
        const w = Number(r.weight);
        if (!weightMap.has(k) || (weightMap.get(k) ?? 0) < w) weightMap.set(k, w);
      }
      competitors = (peers ?? [])
        .filter((p) => p.ticker)
        .map((p) => ({ name: p.canonical_name, ticker: toTradingViewSymbol(p.ticker as string) ?? (p.ticker as string), weight: weightMap.get(p.id) ?? 0 }));
    }
    // Fallback: same-sector peers if we have no explicit competitors
    if (competitors.length === 0 && resolved.sector) {
      const { data: sectorPeers } = await db
        .from("entities")
        .select("id, canonical_name, ticker")
        .eq("entity_type", "company")
        .eq("sector", resolved.sector)
        .neq("id", resolved.id)
        .not("ticker", "is", null)
        .limit(6);
      competitors = (sectorPeers ?? []).map((p) => ({ name: p.canonical_name, ticker: toTradingViewSymbol(p.ticker as string) ?? (p.ticker as string), weight: 0.5 }));
    }
    competitors.sort((a, b) => b.weight - a.weight);
    return {
      primary: { name: resolved.canonical_name, ticker: primarySymbol, sector: resolved.sector, region: resolved.region },
      competitors: competitors.slice(0, 3).map(({ name, ticker }) => ({ name, ticker })),
    };
  });

const MarketSeriesInput = z.object({
  primary: z.object({ name: z.string(), ticker: z.string() }),
  competitors: z.array(z.object({ name: z.string(), ticker: z.string() })).max(3).default([]),
  includeCompetitors: z.boolean().default(false),
});

type MarketPoint = { t: string; close: number; pct: number };

function yahooSymbol(tvSymbol: string): string {
  const raw = tvSymbol.toUpperCase();
  const [exchange, code] = raw.includes(":") ? raw.split(":") : ["", raw];
  if (exchange === "LSE") return `${code}.L`;
  if (exchange === "EURONEXT") return `${code}.PA`;
  if (exchange === "XETR") return `${code}.DE`;
  if (exchange === "SIX") return `${code}.SW`;
  if (exchange === "MIL") return `${code}.MI`;
  if (exchange === "BME") return `${code}.MC`;
  if (exchange === "NYSE" || exchange === "NASDAQ") return code;
  return raw.replace(":", ".");
}

async function fetchYahooSeries(symbol: string): Promise<MarketPoint[]> {
  const yahoo = yahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=1y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Arklight/1.0" } });
  if (!res.ok) return [];
  const body = await res.json() as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points = timestamps
    .map((ts, i) => ({ t: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p): p is { t: string; close: number } => typeof p.close === "number" && Number.isFinite(p.close));
  const first = points[0]?.close;
  if (!first) return [];
  return points.map((p) => ({ ...p, pct: Number((((p.close - first) / first) * 100).toFixed(2)) })).slice(-260);
}

export const getMarketSeries = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((d: unknown) => MarketSeriesInput.parse(d))
  .handler(async ({ data }) => {
    const instruments = [data.primary, ...(data.includeCompetitors ? data.competitors : [])];
    const series = await Promise.all(instruments.map(async (item) => ({
      name: item.name,
      ticker: item.ticker,
      points: await fetchYahooSeries(item.ticker),
    })));
    return {
      series: series.filter((s) => s.points.length >= 2),
      source: "Yahoo Finance delayed market data",
    };
  });

