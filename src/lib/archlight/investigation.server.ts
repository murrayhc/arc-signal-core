// Active-investigation pass: for events with OPEN outcome_predictions,
// prioritise those nearest their deadline, hit GDELT for corroborating /
// contradicting coverage, and ingest real matches through the same
// document → atomic_claims → canonical_claims → claim_lineage path the
// scan uses. New evidence attaches to the event's canonical claims, so the
// outcome engine resolves predictions on real new signals instead of only
// waiting for the passive scan.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { gdeltSearch, type GdeltArticle } from "./search/gdelt.server";
import { ingestDocument, type IngestSource } from "./ingest.server";

type DbAdmin = SupabaseClient<Database>;

async function admin(): Promise<DbAdmin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface RunInvestigationOpts {
  scanRunId?: string | null;
  maxEvents?: number;
  maxPerEvent?: number;
}

export interface RunInvestigationResult {
  events_investigated: number;
  queries_run: number;
  articles_seen: number;
  articles_ingested: number;
  claims_created: number;
  notes: string[];
}

function buildQuery(evt: {
  title: string | null;
  affected_sector: string | null;
  affected_region: string | null;
  primary_entity_name?: string | null;
}): string {
  const title = (evt.title ?? "").trim().replace(/["“”]/g, "").slice(0, 120);
  const parts: string[] = [];
  if (title) parts.push(`"${title}"`);
  if (evt.primary_entity_name) parts.push(`"${evt.primary_entity_name}"`);
  if (evt.affected_sector) parts.push(evt.affected_sector);
  if (evt.affected_region) parts.push(evt.affected_region);
  return parts.filter(Boolean).join(" ").slice(0, 240);
}

async function findOrCreateSearchSource(db: DbAdmin, domain: string): Promise<IngestSource | null> {
  const clean = domain.toLowerCase().replace(/^www\./, "");
  if (!clean) return null;
  const { data: existing } = await db
    .from("sources")
    .select("id, name, reliability_score, base_url, feed_url, is_synthetic, independence_group")
    .eq("base_url", clean)
    .maybeSingle();
  if (existing) return existing as IngestSource;
  const { data: created, error } = await db
    .from("sources")
    .insert({
      name: clean,
      source_type: "news",
      access_method: "rss",
      base_url: clean,
      feed_url: null,
      feed_kind: "synthetic",
      is_synthetic: false,
      status: "active",
      reliability_score: 0.5,
      health_score: 0.7,
      collector_supported: false,
      metadata: { origin: "gdelt_investigation" },
    })
    .select("id, name, reliability_score, base_url, feed_url, is_synthetic, independence_group")
    .single();
  if (error || !created) return null;
  return created as IngestSource;
}

export async function runInvestigation(
  opts: RunInvestigationOpts = {},
): Promise<RunInvestigationResult> {
  const db = await admin();
  const maxEvents = Math.max(1, Math.min(20, opts.maxEvents ?? 8));
  const maxPerEvent = Math.max(1, Math.min(25, opts.maxPerEvent ?? 12));
  const notes: string[] = [];
  const result: RunInvestigationResult = {
    events_investigated: 0,
    queries_run: 0,
    articles_seen: 0,
    articles_ingested: 0,
    claims_created: 0,
    notes,
  };

  // Pick events with OPEN predictions, prioritised by nearest deadline.
  const { data: openPreds } = await db
    .from("outcome_predictions")
    .select("event_candidate_id, deadline, status, subject_kind")
    .eq("status", "open")
    .eq("subject_kind", "event")
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(200);
  const seen = new Set<string>();
  const eventIds: string[] = [];
  for (const p of openPreds ?? []) {
    const id = p.event_candidate_id as string | null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    eventIds.push(id);
    if (eventIds.length >= maxEvents) break;
  }
  if (eventIds.length === 0) {
    notes.push("Investigation: no events with open predictions.");
    return result;
  }

  const { data: events } = await db
    .from("event_candidates")
    .select("id, title, affected_sector, affected_region, primary_entity_id")
    .in("id", eventIds);
  const eventMap = new Map<string, {
    id: string; title: string | null;
    affected_sector: string | null; affected_region: string | null;
    primary_entity_id: string | null;
  }>();
  for (const e of events ?? []) eventMap.set(e.id, e as {
    id: string; title: string | null; affected_sector: string | null;
    affected_region: string | null; primary_entity_id: string | null;
  });

  // Resolve primary entity names in one shot.
  const entIds = Array.from(new Set((events ?? [])
    .map((e) => e.primary_entity_id).filter((x): x is string => !!x)));
  const entityNameMap = new Map<string, string>();
  if (entIds.length) {
    const { data: ents } = await db.from("entities").select("id, name").in("id", entIds);
    for (const e of ents ?? []) entityNameMap.set(e.id, e.name);
  }

  // Small window of recent doc signatures for copy-loop detection.
  const { data: recentDocs } = await db
    .from("documents")
    .select("id, title, body, shingle_signature")
    .order("fetched_at", { ascending: false })
    .limit(80);
  const { shingles } = await import("./text.server");
  const recentShingleSets = (recentDocs ?? []).map((d) => ({
    id: d.id,
    s: shingles(`${d.title ?? ""} ${d.body ?? ""}`, 5),
    sig: d.shingle_signature as string | null,
  }));

  for (const eventId of eventIds) {
    const evt = eventMap.get(eventId);
    if (!evt) continue;
    result.events_investigated++;
    const primaryEntityName = evt.primary_entity_id ? (entityNameMap.get(evt.primary_entity_id) ?? null) : null;
    const query = buildQuery({
      title: evt.title,
      affected_sector: evt.affected_sector,
      affected_region: evt.affected_region,
      primary_entity_name: primaryEntityName,
    });
    if (!query) continue;

    // Dedupe candidate URLs against existing documents.
    const articles: GdeltArticle[] = await gdeltSearch(query, {
      maxRecords: maxPerEvent,
      timespan: "2weeks",
    });
    result.queries_run++;
    result.articles_seen += articles.length;

    const urls = articles.map((a) => a.url).filter(Boolean);
    let existingUrls = new Set<string>();
    if (urls.length) {
      const { data: existing } = await db.from("documents").select("url").in("url", urls);
      existingUrls = new Set((existing ?? []).map((d) => d.url).filter((u): u is string => !!u));
    }

    const evidenceIds: string[] = [];
    let ingestedForEvent = 0;
    let queryErr: string | null = null;
    for (const art of articles) {
      if (ingestedForEvent >= maxPerEvent) break;
      if (!art.url || existingUrls.has(art.url)) continue;
      try {
        const src = await findOrCreateSearchSource(db, art.domain);
        if (!src) continue;
        const title = (art.title ?? "").slice(0, 300);
        const body = ((art.snippet ?? "") || title).slice(0, 1200);
        if (!title || !body) continue;
        const ing = await ingestDocument(db, {
          src,
          title,
          body,
          url: art.url,
          publishedAt: art.seendate,
          isSynthetic: false,
          collectedVia: "gdelt_investigation",
          recentShingleSets,
          copyLoopJaccard: 0.55,
          logStage: `investigation:${eventId.slice(0, 8)}`,
        });
        for (const n of ing.notes) notes.push(n);
        if (ing.docId) {
          result.articles_ingested++;
          ingestedForEvent++;
          result.claims_created += ing.atomicsCreated;
          for (const c of ing.newClaims) if (c.canonical_id) evidenceIds.push(c.canonical_id);
        }
      } catch (err) {
        queryErr = err instanceof Error ? err.message : String(err);
        notes.push(`Investigation ingest failed for ${art.domain}: ${queryErr}`);
      }
    }

    await db.from("investigation_queries").insert({
      event_candidate_id: eventId,
      query_text: query,
      query_class: "auto:prediction",
      status: queryErr ? "completed_with_errors" : "completed",
      result_count: articles.length,
      evidence_ids: Array.from(new Set(evidenceIds)),
      metadata: {
        scan_run_id: opts.scanRunId ?? null,
        ingested: ingestedForEvent,
        max_per_event: maxPerEvent,
        source: "gdelt",
      },
    });
  }

  notes.push(
    `Investigation: ${result.events_investigated} event(s), ${result.queries_run} query, ` +
    `${result.articles_seen} article(s) seen, ${result.articles_ingested} ingested, ` +
    `${result.claims_created} claim(s) created.`,
  );
  return result;
}
