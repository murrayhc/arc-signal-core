import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callAI, callJson, callEmbedding, guardFinancialAdvice, pickModel } from "./ai-gateway.server";
import { shingles, jaccard, shingleSignature, cosine, centroid, fetchFeed } from "./text.server";
import { DEFAULT_SCAN_SETTINGS, type ScanSettings } from "./settings.defaults";

const SCAN_RUNTIME_BUDGET_MS = 4 * 60 * 1000;
const STALE_RUNNING_SCAN_MS = 6 * 60 * 1000;
const MAX_SYNTHESIS_CLUSTERS_PER_SCAN = 10;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function reapStaleRunningScans(db: Awaited<ReturnType<typeof admin>>) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_SCAN_MS).toISOString();
  await db
    .from("scan_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), notes: "Auto-marked failed: scan exceeded runtime budget and was never finalised." })
    .eq("status", "running")
    .lt("started_at", cutoff);
}

async function loadScanSettings(): Promise<ScanSettings> {
  const db = await admin();
  const { data } = await db.from("scan_settings").select("*").eq("singleton", true).maybeSingle();
  if (!data) return { ...DEFAULT_SCAN_SETTINGS };
  return {
    sources_per_scan: Number(data.sources_per_scan),
    items_per_feed: Number(data.items_per_feed),
    copy_loop_jaccard: Number(data.copy_loop_jaccard),
    bucketing_strategy: data.bucketing_strategy as ScanSettings["bucketing_strategy"],
    cluster_merge_cosine: Number(data.cluster_merge_cosine),
    max_claims_per_cluster: Number(data.max_claims_per_cluster),
    min_evidence_count: Number(data.min_evidence_count),
    min_source_diversity: Number(data.min_source_diversity),
    min_confidence: Number(data.min_confidence),
    interrogation_cache_ms: Number(data.interrogation_cache_ms),
  };
}

// ============ DASHBOARD READS ============
export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  try { await reapStaleRunningScans(db); } catch { /* best-effort */ }
  const [sources, events, opps, risks, scan, sysConf, nodes, edges, ticker, positioning, docs, unseenAlerts, arcs] = await Promise.all([
    db.from("sources").select("status, health_score, reliability_score, is_synthetic"),
    db.from("event_candidates").select("id, title, event_class, status, severity, risk_score, opportunity_score, confidence").order("last_updated_at", { ascending: false }),
    db.from("opportunity_cards").select("id, title, opportunity_type, summary, affected_sectors, affected_regions, urgency_score, commercial_value_score, confidence").order("commercial_value_score", { ascending: false }).limit(8),
    db.from("event_candidates").select("id, title, summary, severity, risk_score, probability, confidence, affected_sector, affected_region, last_updated_at").in("event_class", ["risk", "mixed", "watch"]).order("risk_score", { ascending: false }).limit(6),
    db.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("llm_task_logs").select("provider, latency_ms, status, validation_status").order("created_at", { ascending: false }).limit(100),
    db.from("graph_nodes").select("id, node_type, title, summary, confidence, risk_score, opportunity_score").order("updated_at", { ascending: false }).limit(80),
    db.from("graph_edges").select("source_node_id, target_node_id, edge_type, label, weight, confidence").limit(200),
    db.from("event_candidates").select("title, event_class, opportunity_score, risk_score, confidence").order("last_updated_at", { ascending: false }).limit(6),
    db.from("strategic_positioning").select("id, title, user_type, how_it_could_be_used, why_it_may_matter, confidence, constraints").limit(4),
    db.from("documents").select("copy_loop_score, is_likely_copy").order("fetched_at", { ascending: false }).limit(200),
    db.from("alerts").select("id, watchlist_id, event_candidate_id, reason, severity, created_at, seen").eq("seen", false).order("created_at", { ascending: false }).limit(20),
    db.from("evidence_arcs").select("id, title, true_potential_score, confidence, contradiction_score, source_diversity, momentum_score, updated_at").order("updated_at", { ascending: false }).limit(6),
  ]);

  const sourcesArr = sources.data ?? [];
  const online = sourcesArr.filter((s) => s.status === "active").length;
  const avgHealth = sourcesArr.length ? sourcesArr.reduce((a, s) => a + Number(s.health_score), 0) / sourcesArr.length : 0;
  const avgRel = sourcesArr.length ? sourcesArr.reduce((a, s) => a + Number(s.reliability_score), 0) / sourcesArr.length : 0;
  const logs = sysConf.data ?? [];
  const okShare = logs.length ? logs.filter((l) => l.status === "ok").length / logs.length : 0.9;
  const validShare = logs.length ? logs.filter((l) => l.validation_status === "valid").length / logs.length : 0.8;

  const docsArr = docs.data ?? [];
  const copyCount = docsArr.filter((d) => d.is_likely_copy).length;
  const copyLoopHygiene = docsArr.length
    ? 1 - copyCount / docsArr.length
    : 1;

  return {
    counts: {
      sources_online: online,
      sources_total: sourcesArr.length,
      events_tracked: events.data?.length ?? 0,
      open_opportunities: (events.data ?? []).filter((e) => e.event_class === "opportunity" || e.event_class === "mixed").length,
      active_risks: (events.data ?? []).filter((e) => e.event_class === "risk" || e.event_class === "mixed").length,
      unseen_alerts: unseenAlerts.data?.length ?? 0,
    },
    system: {
      source_coverage: Number(avgHealth.toFixed(3)),
      model_health: Number(okShare.toFixed(3)),
      evidence_quality: Number(((avgRel + validShare) / 2).toFixed(3)),
      copy_loop_hygiene: Number(copyLoopHygiene.toFixed(3)),
      last_scan: scan.data ?? null,
    },
    opportunities: opps.data ?? [],
    risks: risks.data ?? [],
    graph: {
      nodes: nodes.data ?? [],
      edges: edges.data ?? [],
    },
    ticker: ticker.data ?? [],
    positioning: positioning.data ?? [],
    alerts: unseenAlerts.data ?? [],
    arcs: arcs.data ?? [],
  };
});

// ============ RUN SCAN (full pipeline: collect → extract → cluster → synthesize) ============
export const runScan = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const settings = await loadScanSettings();
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + SCAN_RUNTIME_BUDGET_MS;

  // Reap stale RUNNING scans (worker was killed mid-run and never finalised
  // the row). Scans self-stop at the runtime budget, so older rows are dead.
  try {
    await reapStaleRunningScans(db);
  } catch { /* best-effort */ }

  const { data: activeRun } = await db
    .from("scan_runs")
    .select("*")
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - STALE_RUNNING_SCAN_MS).toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeRun) {
    return {
      scan_run_id: activeRun.id,
      status: "already_running",
      sources_attempted: Number(activeRun.sources_attempted ?? 0),
      sources_succeeded: Number(activeRun.sources_succeeded ?? 0),
      sources_failed: Number(activeRun.sources_failed ?? 0),
      documents_collected: Number(activeRun.documents_collected ?? 0),
      atomic_claims_created: Number(activeRun.atomic_claims_created ?? 0),
      events_created: Number(activeRun.events_created ?? 0),
      events_skipped: 0,
      precognition_processed: 0,
      notes: ["A scan is already running; wait for it to finish before starting another."],
    };
  }

  const started = new Date().toISOString();
  const { data: run, error: runErr } = await db.from("scan_runs").insert({ status: "running", started_at: started }).select().single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Failed to open scan run");

  const notes: string[] = [];
  notes.push(`Scan settings — sources:${settings.sources_per_scan} items/feed:${settings.items_per_feed} bucketing:${settings.bucketing_strategy} merge_cos:${settings.cluster_merge_cosine} copy_j:${settings.copy_loop_jaccard} min_evidence:${settings.min_evidence_count} min_diversity:${settings.min_source_diversity} min_conf:${settings.min_confidence}${settings.max_claims_per_cluster ? ` max_claims:${settings.max_claims_per_cluster}` : ""}`);
  let documentsCollected = 0;
  let atomicClaimsCreated = 0;
  let eventsCreated = 0;
  let eventsSkipped = 0;
  let sourcesAttempted = 0;
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;

  const { data: sources } = await db.from("sources").select("*").eq("status", "active").order("reliability_score", { ascending: false }).limit(settings.sources_per_scan);
  const chosen = sources ?? [];

  const hasBudget = () => Date.now() < deadlineAtMs;
  const saveProgress = async (extraNote?: string) => {
    const progressSummary = `Progress — docs:${documentsCollected} claims:${atomicClaimsCreated} events:${eventsCreated} skipped:${eventsSkipped}`;
    const compactNotes = [progressSummary, ...notes.slice(-14), ...(extraNote ? [extraNote] : [])].join(" | ").slice(0, 2000);
    await db.from("scan_runs").update({
      sources_attempted: sourcesAttempted,
      sources_succeeded: sourcesSucceeded,
      sources_failed: sourcesFailed,
      documents_collected: documentsCollected,
      atomic_claims_created: atomicClaimsCreated,
      events_created: eventsCreated,
      notes: compactNotes,
    }).eq("id", run.id);
  };

  // Track new atomic claims collected this scan for downstream clustering
  interface NewClaim {
    id: string;
    text: string;
    type: string;
    sectors: string[];
    regions: string[];
    entities: string[];
    commodities: string[];
    canonical_id: string | null;
    source_id: string;
    source_name: string;
    reliability: number;
    doc_id: string;
    doc_url: string;
    embedding: number[] | null;
  }
  const newClaims: NewClaim[] = [];

  // Load a small window of recent doc signatures for copy-loop detection.
  const { data: recentDocs } = await db.from("documents").select("id, title, body, shingle_signature").order("fetched_at", { ascending: false }).limit(80);
  const recentShingleSets = (recentDocs ?? []).map((d) => ({ id: d.id, s: shingles(`${d.title ?? ""} ${d.body ?? ""}`, 5), sig: d.shingle_signature as string | null }));

  for (const src of chosen) {
    if (!hasBudget()) {
      notes.push("Stopped source intake early: scan runtime budget reached; partial results saved.");
      break;
    }
    sourcesAttempted++;
    try {
      // 1. Collect one or more documents for this source (RSS multi-pick or single synthetic).


      // Build a list of picks to process for this source. RSS sources may yield
      // multiple items when `items_per_feed > 1`; non-RSS sources yield one
      // synthetic slot.
      type Pick = { title: string; body: string; url: string; publishedAt: string | null; isSynthetic: boolean; collectedVia: "rss" | "synthetic" };
      const picks: Pick[] = [];

      if (src.feed_url && (src.feed_kind === "rss" || src.feed_kind === "atom")) {
        try {
          const items = await fetchFeed(src.feed_url);
          const valid = items.filter((it) => it.title && it.description).slice(0, Math.max(1, settings.items_per_feed));
          for (const it of valid) {
            picks.push({
              title: it.title,
              body: it.description,
              url: it.link ?? `https://demo/${src.id.slice(0, 8)}/${Date.now()}-${picks.length}`,
              publishedAt: it.publishedAt ?? new Date().toISOString(),
              isSynthetic: false,
              collectedVia: "rss",
            });
          }
        } catch (err) {
          notes.push(`RSS fetch failed for ${src.name}: ${err instanceof Error ? err.message : String(err)} — falling back to synthetic.`);
        }
      }

      // If RSS produced nothing, fall back to a single synthetic slot (title/body filled below).
      if (picks.length === 0) {
        picks.push({
          title: "",
          body: "",
          url: `https://demo/${src.id.slice(0, 8)}/${Date.now()}`,
          publishedAt: new Date().toISOString(),
          isSynthetic: true,
          collectedVia: "synthetic",
        });
      }

      let sourceProducedAtLeastOne = false;

      for (const pick of picks) {
        if (!hasBudget()) {
          notes.push(`Stopped processing remaining items for ${src.name}: scan runtime budget reached.`);
          break;
        }
        let title = pick.title;
        let body = pick.body;
        const url = pick.url;
        const publishedAt = pick.publishedAt;
        const isSynthetic = pick.isSynthetic;
        const collectedVia = pick.collectedVia;

        if (!title || !body) {
          const gen = await callJson<{ title: string; body: string }>({
            task: "atomic_claim_extraction",
            system: "You are a synthetic public-signal generator for the Archlight prototype. Produce ONE short public information item (title + 3-5 sentence body) that could realistically come from the given source type. It should describe a concrete event, filing, procurement, layoff, executive move, regulatory action, supply issue, commodity move, or corporate statement in a specific sector and region. Return JSON: {\"title\":string,\"body\":string}. Do not give financial advice, no buy/sell/hold/target price language.",
            user: `Source: ${src.name} (${src.source_type}). Generate one realistic public-signal document.`,
          });
          await logTask(db, "atomic_claim_extraction", gen, "doc_generation");
          if (!gen.ok || !gen.data) { notes.push(`${src.name}: synthetic doc generation failed — ${gen.error ?? "unknown"}`); continue; }
          title = gen.data.title;
          body = gen.data.body;
        }

        const guard = guardFinancialAdvice(`${title} ${body}`);
        if (!guard.ok) {
          notes.push(`Rejected doc from ${src.name}: forbidden language (${guard.violations.join(", ")})`);
          await db.from("llm_task_logs").insert({ task_type: "atomic_claim_extraction", provider: "lovable", model: pickModel("atomic_claim_extraction"), status: "rejected", validation_status: "guardrail_violation", error: guard.violations.join(", ") });
          continue;
        }

        // Copy-loop detection against recent docs.
        const docShingles = shingles(`${title} ${body}`, 5);
        const sig = shingleSignature(`${title} ${body}`);
        let bestJ = 0;
        for (const r of recentShingleSets) {
          const j = jaccard(docShingles, r.s);
          if (j > bestJ) bestJ = j;
        }
        const isLikelyCopy = bestJ >= settings.copy_loop_jaccard;
        const copyLoopScore = Number(bestJ.toFixed(3));

        const { data: doc } = await db.from("documents").insert({
          source_id: src.id,
          url,
          title,
          body,
          published_at: publishedAt,
          is_synthetic: isSynthetic,
          shingle_signature: sig,
          copy_loop_score: copyLoopScore,
          is_likely_copy: isLikelyCopy,
        }).select().single();
        if (!doc) { notes.push(`${src.name}: insert doc failed`); continue; }
        documentsCollected++;
        recentShingleSets.push({ id: doc.id, s: docShingles, sig });

        if (isLikelyCopy) notes.push(`Copy-loop flag on ${src.name}: Jaccard ${copyLoopScore} vs recent doc.`);
        notes.push(`${src.name}: collected via ${collectedVia}${isLikelyCopy ? " (flagged as likely copy)" : ""}.`);

        const ext = await callJson<{ claims: Array<{ claim_text: string; claim_type: string; entities: string[]; sectors: string[]; regions: string[]; commodities: string[]; specificity: number }> }>({
          task: "atomic_claim_extraction",
          system: "Extract atomic factual claims from the article. Each claim must be a single verifiable statement, no opinion. Return JSON: {\"claims\":[{\"claim_text\":string,\"claim_type\":one of layoff|hiring|regulatory|procurement|supply_chain|market|commodity|company_statement|executive|legal|complaint|demand|funding|macro|unknown,\"entities\":string[],\"sectors\":string[],\"regions\":string[],\"commodities\":string[],\"specificity\":0..1}]}. Do not invent, do not give financial advice.",
          user: `TITLE: ${doc.title}\n\nBODY: ${doc.body}`,
        });
        await logTask(db, "atomic_claim_extraction", ext, "claim_extraction");

        if (ext.ok && ext.data?.claims) {
          for (const c of ext.data.claims) {
            const guard2 = guardFinancialAdvice(c.claim_text);
            if (!guard2.ok) continue;
            const norm = c.claim_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-").slice(0, 200);
            const claimType = allowedClaimType(c.claim_type);
            const rel = Math.min(1, 0.4 + Number(src.reliability_score) * 0.5);
            const { data: canonical } = await db.from("canonical_claims").upsert({
              claim_text: c.claim_text,
              normalised_claim_text: norm,
              claim_type: claimType,
              first_seen_source_id: src.id,
              origin_candidate_url: doc.url,
              reliability_score: rel,
              factuality: Number(src.reliability_score) > 0.8 ? "supported" : "weak_single_source",
            }, { onConflict: "normalised_claim_text" }).select().single();

            let embedding: number[] | null = null;
            if (canonical && !(canonical as { embedding?: unknown }).embedding) {
              const emb = await callEmbedding(c.claim_text);
              if (emb.ok && emb.vector) {
                embedding = emb.vector;
                await db.from("canonical_claims").update({ embedding }).eq("id", canonical.id);
              }
              await db.from("llm_task_logs").insert({ task_type: "claim_normalisation", provider: "lovable", model: emb.model, status: emb.ok ? "ok" : "error", latency_ms: emb.latencyMs, validation_status: emb.ok ? "valid" : "invalid", error: emb.error, prompt_excerpt: `embed: ${c.claim_text.slice(0, 200)}`, response_excerpt: emb.ok ? `vec[${emb.vector?.length ?? 0}]` : (emb.error ?? "") });
            } else if (canonical) {
              const existing = (canonical as { embedding?: unknown }).embedding;
              if (Array.isArray(existing)) embedding = existing as number[];
            }

            if (canonical) {
              await db.from("canonical_claims").update({
                repeat_count: (canonical.repeat_count ?? 0) + 1,
                independent_source_count: (canonical.independent_source_count ?? 0) + (canonical.first_seen_source_id === src.id ? 0 : 1),
                support_score: Math.min(1, Number(canonical.support_score ?? 0) + 0.1),
                updated_at: new Date().toISOString(),
              }).eq("id", canonical.id);
            }

            const { data: atomic } = await db.from("atomic_claims").insert({
              document_id: doc.id,
              source_id: src.id,
              canonical_claim_id: canonical?.id ?? null,
              claim_text: c.claim_text,
              claim_type: claimType,
              entities: c.entities ?? [],
              sectors: c.sectors ?? [],
              regions: c.regions ?? [],
              commodities: c.commodities ?? [],
              extraction_confidence: 0.75,
              specificity_score: Math.max(0, Math.min(1, c.specificity ?? 0.5)),
              factuality_label: Number(src.reliability_score) > 0.8 ? "supported" : "weak_single_source",
            }).select().single();
            atomicClaimsCreated++;

            if (canonical && atomic) {
              await db.from("claim_lineage").insert({
                canonical_claim_id: canonical.id,
                source_id: src.id,
                document_id: doc.id,
                url: doc.url,
                published_at: new Date().toISOString(),
                relation_to_origin: canonical.first_seen_source_id === src.id ? "origin_candidate" : (isLikelyCopy ? "likely_copy" : "independent_support"),
                is_likely_copy: isLikelyCopy,
                origin_confidence: canonical.first_seen_source_id === src.id ? 0.8 : (isLikelyCopy ? 0.2 : 0.55),
              });

              newClaims.push({
                id: atomic.id,
                text: c.claim_text,
                type: claimType,
                sectors: c.sectors ?? [],
                regions: c.regions ?? [],
                entities: c.entities ?? [],
                commodities: c.commodities ?? [],
                canonical_id: canonical.id,
                source_id: src.id,
                source_name: src.name,
                reliability: rel,
                doc_id: doc.id,
                doc_url: doc.url ?? "",
                embedding,
              });
            }
          }
        }

        sourceProducedAtLeastOne = true;
      }

      if (!sourceProducedAtLeastOne) throw new Error("no usable docs from source");


      await db.from("sources").update({ last_success_at: new Date().toISOString(), health_score: Math.min(1, Number(src.health_score) + 0.01) }).eq("id", src.id);
      sourcesSucceeded++;
      await saveProgress();
    } catch (err) {
      sourcesFailed++;
      notes.push(`${src.name}: ${err instanceof Error ? err.message : String(err)}`);
      await db.from("sources").update({ last_failure_at: new Date().toISOString(), health_score: Math.max(0, Number(src.health_score) - 0.05) }).eq("id", src.id);
      await saveProgress();
    }
  }

  // ============ SYNTHESIS PHASE ============
  // Semantic clustering: seed buckets by configurable strategy, then merge
  // buckets whose embedding centroids exceed the configured cosine threshold.
  const seedClusters = new Map<string, NewClaim[]>();
  for (const c of newClaims) {
    const sector = (c.sectors[0] ?? "general").toLowerCase();
    let key: string;
    if (settings.bucketing_strategy === "type") key = c.type;
    else if (settings.bucketing_strategy === "sector") key = sector;
    else key = `${c.type}::${sector}`;
    const bucket = seedClusters.get(key) ?? [];
    bucket.push(c);
    seedClusters.set(key, bucket);
  }
  const clusterEntries: Array<{ key: string; members: NewClaim[]; centroid: number[] | null }> = [];
  for (const [key, members] of seedClusters) {
    const vecs = members.map((m) => m.embedding).filter((v): v is number[] => Array.isArray(v));
    clusterEntries.push({ key, members, centroid: centroid(vecs) });
  }
  const mergeThreshold = settings.cluster_merge_cosine;
  const preMerge: typeof clusterEntries = [];
  for (const cluster of clusterEntries) {
    const target = preMerge.find((m) => m.centroid && cluster.centroid && cosine(m.centroid, cluster.centroid) >= mergeThreshold);
    if (target) {
      target.members = target.members.concat(cluster.members);
      const vecs = target.members.map((m) => m.embedding).filter((v): v is number[] => Array.isArray(v));
      target.centroid = centroid(vecs);
      target.key = `${target.key}+${cluster.key}`;
    } else {
      preMerge.push({ ...cluster });
    }
  }

  // Optional: split oversized clusters by region-then-entity so one big bucket
  // can produce multiple events instead of collapsing into one.
  const merged: typeof clusterEntries = [];
  const maxPer = settings.max_claims_per_cluster;
  for (const cluster of preMerge) {
    if (!maxPer || cluster.members.length <= maxPer) { merged.push(cluster); continue; }
    const byRegion = new Map<string, NewClaim[]>();
    for (const m of cluster.members) {
      const rk = (m.regions[0] ?? m.entities[0] ?? "global").toLowerCase();
      const list = byRegion.get(rk) ?? [];
      list.push(m);
      byRegion.set(rk, list);
    }
    let idx = 0;
    for (const [rk, members] of byRegion) {
      const vecs = members.map((m) => m.embedding).filter((v): v is number[] => Array.isArray(v));
      merged.push({ key: `${cluster.key}#${rk}`, members, centroid: centroid(vecs) });
      idx++;
    }
    notes.push(`Split oversized cluster ${cluster.key} (${cluster.members.length} claims) into ${idx} sub-clusters.`);
  }

  const prioritisedClusters = merged
    .map((cluster) => {
      const sourceCount = new Set(cluster.members.map((m) => m.source_id)).size;
      const avgReliability = cluster.members.reduce((a, m) => a + m.reliability, 0) / Math.max(1, cluster.members.length);
      return { ...cluster, score: (sourceCount * 4) + cluster.members.length + avgReliability };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SYNTHESIS_CLUSTERS_PER_SCAN);
  if (merged.length > prioritisedClusters.length) {
    notes.push(`Prioritised ${prioritisedClusters.length}/${merged.length} clusters for this scan to keep runtime bounded.`);
  }

  for (const { key, members: group } of prioritisedClusters) {
    if (!hasBudget()) {
      notes.push("Stopped synthesis early: scan runtime budget reached; partial results saved.");
      break;
    }
    try {
      const primaryType = group[0].type;
      const primarySector = (group[0].sectors[0] ?? "general").toLowerCase();
      const region = group.find((g) => g.regions.length)?.regions[0] ?? "global";
      const entities = Array.from(new Set(group.flatMap((g) => g.entities))).slice(0, 6);
      const commodities = Array.from(new Set(group.flatMap((g) => g.commodities))).slice(0, 4);
      const avgRel = group.reduce((a, g) => a + g.reliability, 0) / group.length;
      const sourceDiv = new Set(group.map((g) => g.source_id)).size;
      const type = primaryType;
      const sector = primarySector;

      // Ask model to synthesize an event candidate + impacts + opportunity + positioning
      const synth = await callJson<{
        event: { title: string; event_type: string; event_class: "risk"|"opportunity"|"mixed"|"watch"|"unknown"; summary: string; severity: "low"|"moderate"|"high"|"critical"; probability: number; confidence: number; risk_score: number; opportunity_score: number };
        impacts: Array<{ company: string; impact_type: "beneficiary"|"harmed"|"mixed"|"exposed"|"watch_only"|"unknown"; pathway: string; risk_score: number; opportunity_score: number; watch_signals: string[]; confidence: number }>;
        opportunity: { title: string; opportunity_type: string; summary: string; buyer_pain: string; likely_buyers: string[]; suggested_offer: string; urgency_score: number; commercial_value_score: number; confidence: number; opportunity_logic: string; next_best_action: string } | null;
        positioning: { title: string; user_type: string; positioning_angle: string; how_it_could_be_used: string; why_it_may_matter: string; constraints: string; confidence: number } | null;
        contradictions: string[];
      }>({
        task: "company_impact_analysis",
        model: "google/gemini-2.5-flash",
        maxTokens: 2200,
        system: "You are Archlight scan synthesis. Return ONLY strict JSON. Required shape: {\"event\":{\"title\":string,\"event_type\":string,\"event_class\":\"risk\"|\"opportunity\"|\"mixed\"|\"watch\"|\"unknown\",\"summary\":string,\"severity\":\"low\"|\"moderate\"|\"high\"|\"critical\",\"probability\":number,\"confidence\":number,\"risk_score\":number,\"opportunity_score\":number},\"impacts\":[{\"company\":string,\"impact_type\":\"beneficiary\"|\"harmed\"|\"mixed\"|\"exposed\"|\"watch_only\"|\"unknown\",\"pathway\":string,\"risk_score\":number,\"opportunity_score\":number,\"watch_signals\":string[],\"confidence\":number}],\"opportunity\":object|null,\"positioning\":object|null,\"contradictions\":string[]}. Be hedged (may, could, appears). NEVER give financial advice: no buy/sell/hold, no target price, no portfolio allocation.",
        user: `Cluster type: ${type}. Sector: ${sector}. Region: ${region}. Entities: ${entities.join(", ") || "n/a"}. Commodities: ${commodities.join(", ") || "n/a"}. Sources: ${group.length} claims from ${sourceDiv} distinct source(s), avg reliability ${avgRel.toFixed(2)}.\n\nClaims:\n${group.map((g, i) => `[${i+1}] (${g.source_name}) ${g.text}`).join("\n")}\n\nReturn JSON with keys: event, impacts (array), opportunity (or null), positioning (or null), contradictions (array of strings).`,
      });
      await logTask(db, "company_impact_analysis", synth, `cluster:${key}`);

      if (!synth.ok || !synth.data?.event) {
        const reason = !synth.ok
          ? `synth call failed (${synth.error ?? "unknown"})`
          : "synth returned no event object";
        notes.push(`Synthesis dropped (${key}, ${group.length} claims / ${new Set(group.map((g) => g.source_id)).size} src): ${reason}`);
        eventsSkipped++;
        continue;
      }
      const guardE = guardFinancialAdvice(JSON.stringify(synth.data));
      if (!guardE.ok) {
        notes.push(`Synthesis rejected (${key}): ${guardE.violations.join(", ")}`);
        eventsSkipped++;
        continue;
      }
      const normalised = normaliseSynthesis(synth.data, {
        key,
        type,
        sector,
        region,
        entities,
        commodities,
        claimCount: group.length,
        sourceCount: sourceDiv,
        avgReliability: avgRel,
      });
      if (!normalised) {
        notes.push(`Synthesis dropped (${key}, ${group.length} claims / ${sourceDiv} src): unusable model shape`);
        eventsSkipped++;
        continue;
      }

      const ev = normalised.event;
      const diversity = Math.min(1, sourceDiv / 3);
      const evConf = clamp01(ev.confidence);
      if (group.length < settings.min_evidence_count) {
        notes.push(`Skipped event (${key}): evidence_count ${group.length} < min ${settings.min_evidence_count}`);
        eventsSkipped++;
        continue;
      }
      if (diversity < settings.min_source_diversity) {
        notes.push(`Skipped event (${key}): source_diversity ${diversity.toFixed(2)} < min ${settings.min_source_diversity}`);
        eventsSkipped++;
        continue;
      }
      if (evConf < settings.min_confidence) {
        notes.push(`Skipped event (${key}): confidence ${evConf.toFixed(2)} < min ${settings.min_confidence}`);
        eventsSkipped++;
        continue;
      }
      const { data: eventRow } = await db.from("event_candidates").insert({
        title: ev.title.slice(0, 240),
        event_type: ev.event_type,
        event_class: ev.event_class,
        summary: ev.summary,
        status: "new",
        severity: ev.severity,
        probability: clamp01(ev.probability),
        confidence: clamp01(ev.confidence),
        affected_sector: sector,
        affected_region: region,
        evidence_count: group.length,
        source_diversity_score: Math.min(1, sourceDiv / 3),
        signal_strength: Math.min(1, group.length / 5),
        novelty_score: 0.6,
        opportunity_score: clamp01(ev.opportunity_score),
        risk_score: clamp01(ev.risk_score),
        created_from_scan_run_id: run.id,
      }).select().single();
      if (!eventRow) continue;
      eventsCreated++;

      // Graph: event node
      const { data: eventNode } = await db.from("graph_nodes").insert({
        node_type: "event", ref_type: "event_candidate", ref_id: eventRow.id,
        title: ev.title.slice(0, 120), summary: ev.summary?.slice(0, 400) ?? null,
        confidence: clamp01(ev.confidence),
        risk_score: clamp01(ev.risk_score),
        opportunity_score: clamp01(ev.opportunity_score),
        impact_score: (clamp01(ev.risk_score) + clamp01(ev.opportunity_score)) / 2,
      }).select().single();

      // Source nodes + edges to event
      const uniqueSources = new Map<string, string>();
      for (const g of group) uniqueSources.set(g.source_id, g.source_name);
      for (const [sid, sname] of uniqueSources) {
        const { data: srcNode } = await db.from("graph_nodes").insert({
          node_type: "source", ref_type: "source", ref_id: sid,
          title: sname.slice(0, 120), confidence: 0.7,
        }).select().single();
        if (srcNode && eventNode) {
          await db.from("graph_edges").insert({
            source_node_id: srcNode.id, target_node_id: eventNode.id,
            edge_type: "reported_by", label: "reported", weight: 0.6, confidence: 0.7, evidence_count: group.filter((g) => g.source_id === sid).length,
          });
        }
      }

      // Claim nodes + edges
      for (const g of group.slice(0, 5)) {
        if (!g.canonical_id) continue;
        const { data: claimNode } = await db.from("graph_nodes").insert({
          node_type: "claim", ref_type: "canonical_claim", ref_id: g.canonical_id,
          title: g.text.slice(0, 120), confidence: g.reliability,
        }).select().single();
        if (claimNode && eventNode) {
          await db.from("graph_edges").insert({
            source_node_id: claimNode.id, target_node_id: eventNode.id,
            edge_type: "supports", label: "supports", weight: g.reliability, confidence: g.reliability, evidence_count: 1,
          });
        }
      }

      // Company impacts
      for (const im of normalised.impacts.slice(0, 8)) {
        const g3 = guardFinancialAdvice(im.pathway);
        if (!g3.ok) continue;
        const { data: impactRow } = await db.from("company_impacts").insert({
          event_candidate_id: eventRow.id,
          company_name: im.company.slice(0, 200),
          impact_type: im.impact_type,
          impact_pathway: im.pathway,
          confidence: clamp01(im.confidence),
          risk_score: clamp01(im.risk_score),
          opportunity_score: clamp01(im.opportunity_score),
          watch_signals: (im.watch_signals ?? []).slice(0, 6),
          evidence_ids: group.map((g) => g.id).slice(0, 10),
        }).select().single();

        // Company graph node + edge
        const { data: coNode } = await db.from("graph_nodes").insert({
          node_type: "company", ref_type: "company_impact", ref_id: impactRow?.id ?? null,
          title: im.company.slice(0, 120), summary: im.pathway.slice(0, 300),
          confidence: clamp01(im.confidence),
          risk_score: clamp01(im.risk_score),
          opportunity_score: clamp01(im.opportunity_score),
        }).select().single();
        if (coNode && eventNode) {
          const edgeType = im.impact_type === "beneficiary" ? "creates_opportunity" : im.impact_type === "harmed" ? "exposes" : "affects";
          await db.from("graph_edges").insert({
            source_node_id: eventNode.id, target_node_id: coNode.id,
            edge_type: edgeType, label: im.impact_type, weight: 0.7, confidence: clamp01(im.confidence), evidence_count: 1,
          });
        }
      }

      // Opportunity card
      let oppCard: { id: string } | null = null;
      if (normalised.opportunity) {
        const o = normalised.opportunity;
        const g4 = guardFinancialAdvice(`${o.title} ${o.summary} ${o.suggested_offer} ${o.next_best_action}`);
        if (g4.ok) {
          const res = await db.from("opportunity_cards").insert({
            event_candidate_id: eventRow.id,
            title: o.title.slice(0, 240),
            opportunity_type: o.opportunity_type,
            summary: o.summary,
            buyer_pain: o.buyer_pain,
            likely_buyers: (o.likely_buyers ?? []).slice(0, 6),
            affected_sectors: [sector],
            affected_regions: [region],
            suggested_offer: o.suggested_offer,
            urgency_score: clamp01(o.urgency_score),
            commercial_value_score: clamp01(o.commercial_value_score),
            confidence: clamp01(o.confidence),
            evidence_score: Math.min(1, group.length / 5),
            actionability_score: 0.6,
            opportunity_logic: o.opportunity_logic,
            next_best_action: o.next_best_action,
          }).select().single();
          oppCard = res.data;
          if (oppCard && eventNode) {
            const { data: oppNode } = await db.from("graph_nodes").insert({
              node_type: "opportunity", ref_type: "opportunity_card", ref_id: oppCard.id,
              title: o.title.slice(0, 120), summary: o.summary.slice(0, 300),
              confidence: clamp01(o.confidence),
              opportunity_score: clamp01(o.commercial_value_score),
            }).select().single();
            if (oppNode) {
              await db.from("graph_edges").insert({
                source_node_id: eventNode.id, target_node_id: oppNode.id,
                edge_type: "creates_opportunity", label: "opens", weight: 0.75, confidence: clamp01(o.confidence), evidence_count: 1,
              });
            }
          }
        }
      }

      // Strategic positioning example
      if (normalised.positioning) {
        const p = normalised.positioning;
        const g5 = guardFinancialAdvice(`${p.title} ${p.positioning_angle} ${p.how_it_could_be_used} ${p.why_it_may_matter} ${p.constraints}`);
        if (g5.ok) {
          await db.from("strategic_positioning").insert({
            event_candidate_id: eventRow.id,
            opportunity_card_id: oppCard?.id ?? null,
            title: p.title.slice(0, 240),
            user_type: p.user_type,
            positioning_angle: p.positioning_angle,
            how_it_could_be_used: p.how_it_could_be_used,
            why_it_may_matter: p.why_it_may_matter,
            evidence_summary: `${group.length} atomic claims across ${sourceDiv} source(s); avg reliability ${avgRel.toFixed(2)}.`,
            confidence: clamp01(p.confidence),
            constraints: p.constraints,
          });
        }
      }

      // Contradictions surfaced by the model → review queue
      const contradictionCount = normalised.contradictions.length;
      for (const c of normalised.contradictions.slice(0, 3)) {
        await db.from("review_queue").insert({
          item_type: "contradiction",
          item_id: eventRow.id,
          reason: c.slice(0, 400),
          status: "pending",
        });
      }

      // ============ EVIDENCE ARC PERSISTENCE ============
      // Persist the story-line as an evidence_arc: source(s) → claims → event → impact/opportunity.
      if (eventNode) {
        const originStrength = Math.min(1, sourceDiv / 3);
        const truePotential = clamp01((0.35 * clamp01(ev.risk_score + ev.opportunity_score) / 2) + (0.25 * originStrength) + (0.2 * clamp01(ev.confidence)) + (0.2 * (contradictionCount ? 0 : 0.8)));
        const { data: arcRow } = await db.from("evidence_arcs").insert({
          root_node_id: eventNode.id,
          root_event_candidate_id: eventRow.id,
          title: ev.title.slice(0, 240),
          summary: ev.summary?.slice(0, 800) ?? null,
          max_degrees: 6,
          true_potential_score: truePotential,
          confidence: clamp01(ev.confidence),
          origin_strength: originStrength,
          source_diversity: Math.min(1, sourceDiv / 4),
          contradiction_score: Math.min(1, contradictionCount / 3),
          momentum_score: Math.min(1, group.length / 6),
        }).select().single();

        if (arcRow) {
          let degree = 0;
          for (const [sid, sname] of uniqueSources) {
            await db.from("evidence_arc_steps").insert({
              evidence_arc_id: arcRow.id, degree, node_type: "source", node_id: null,
              relationship_type: "reported_by",
              explanation: `Reported by ${sname}`,
              confidence: 0.7, source_count: group.filter((g) => g.source_id === sid).length,
            });
          }
          degree = 1;
          for (const g of group.slice(0, 6)) {
            await db.from("evidence_arc_steps").insert({
              evidence_arc_id: arcRow.id, degree, node_type: "claim", node_id: null,
              relationship_type: "supports",
              explanation: g.text.slice(0, 240),
              confidence: g.reliability, source_count: 1,
            });
          }
          degree = 2;
          await db.from("evidence_arc_steps").insert({
            evidence_arc_id: arcRow.id, degree, node_type: "event", node_id: eventNode.id,
            relationship_type: "supports",
            explanation: `Event candidate: ${ev.title}`,
            confidence: clamp01(ev.confidence), source_count: sourceDiv,
          });
          degree = 3;
          for (const im of normalised.impacts.slice(0, 4)) {
            await db.from("evidence_arc_steps").insert({
              evidence_arc_id: arcRow.id, degree, node_type: "company", node_id: null,
              relationship_type: im.impact_type === "beneficiary" ? "creates_opportunity" : (im.impact_type === "harmed" ? "exposes" : "affects"),
              explanation: `${im.company}: ${im.pathway}`.slice(0, 240),
              confidence: clamp01(im.confidence), source_count: 1,
            });
          }
          if (normalised.opportunity) {
            await db.from("evidence_arc_steps").insert({
              evidence_arc_id: arcRow.id, degree: 4, node_type: "opportunity", node_id: null,
              relationship_type: "creates_opportunity",
              explanation: `${normalised.opportunity.title}: ${normalised.opportunity.summary ?? ""}`.slice(0, 240),
              confidence: clamp01(normalised.opportunity.confidence), source_count: 1,
            });
          }
        }
      }

      // ============ WATCHLIST → ALERT MATCHING ============
      const { data: watchlists } = await db.from("watchlists").select("*");
      for (const w of watchlists ?? []) {
        const sectorMatch = !w.sectors?.length || w.sectors.map((x: string) => x.toLowerCase()).includes(sector);
        const regionMatch = !w.regions?.length || w.regions.map((x: string) => x.toLowerCase()).includes((region ?? "").toLowerCase());
        const kw = (w.keywords ?? []) as string[];
        const hay = `${ev.title} ${ev.summary} ${sector} ${region}`.toLowerCase();
        const kwMatch = !kw.length || kw.some((k) => hay.includes(k.toLowerCase()));
        const scoreMatch =
          Number(ev.risk_score) >= Number(w.min_risk ?? 0) &&
          Number(ev.opportunity_score) >= Number(w.min_opportunity ?? 0) &&
          Number(ev.confidence) >= Number(w.min_confidence ?? 0);
        if (sectorMatch && regionMatch && kwMatch && scoreMatch) {
          const parts: string[] = [];
          if (kw.length) parts.push(`keywords: ${kw.filter((k) => hay.includes(k.toLowerCase())).join(", ")}`);
          if (w.sectors?.length) parts.push(`sector ${sector}`);
          if (w.regions?.length) parts.push(`region ${region}`);
          await db.from("alerts").upsert({
            watchlist_id: w.id,
            event_candidate_id: eventRow.id,
            reason: `Matched watchlist "${w.name}" · ${parts.join(" · ") || "score thresholds"}`,
            severity: Number(ev.risk_score) >= 0.7 ? "high" : (Number(ev.opportunity_score) >= 0.7 ? "info" : "low"),
            seen: false,
          }, { onConflict: "watchlist_id,event_candidate_id" });
        }
      }
      await saveProgress(`Synthesised event from cluster ${key}.`);
    } catch (err) {
      notes.push(`Synthesis cluster ${key} failed: ${err instanceof Error ? err.message : String(err)}`);
      eventsSkipped++;
      await saveProgress();
    }
  }

  const status = sourcesFailed > 0 ? "completed_with_errors" : "completed";
  // Prepend a compact summary + skip counters so the truncated `notes` column
  // still shows *why* events=0 even when hundreds of collection notes follow.
  const summary = `Result — docs:${documentsCollected} claims:${atomicClaimsCreated} events:${eventsCreated} skipped:${eventsSkipped}`;
  const joined = [summary, ...notes].join(" | ");
  // Keep the TAIL when we have to truncate — synth-drop / skip reasons are
  // appended later in the run and are the most useful diagnostic.
  const packed = joined.length > 1990
    ? `${summary} | …[${joined.length - 1990} chars omitted]… | ${joined.slice(joined.length - 1600)}`
    : joined;
  await db.from("scan_runs").update({
    status, finished_at: new Date().toISOString(),
    sources_attempted: sourcesAttempted,
    sources_succeeded: sourcesSucceeded,
    sources_failed: sourcesFailed,
    documents_collected: documentsCollected,
    atomic_claims_created: atomicClaimsCreated,
    events_created: eventsCreated,
    notes: packed.slice(0, 2000),
  }).eq("id", run.id);

  // ============ PRECOGNITION PASS ============
  // Project newest high-signal events forward (4 horizons) + propagate impacts
  // across supplier / customer / competitor / peer relationships.
  let precogProcessed = 0;
  try {
    const { projectRecentEvents } = await import("./precognition.functions");
    const r = await projectRecentEvents({ data: { limit: 6 } });
    precogProcessed = r.processed;
    notes.push(`Precognition pass: projected ${precogProcessed} events forward.`);
  } catch (err) {
    notes.push(`Precognition pass skipped: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    scan_run_id: run.id,
    status,
    sources_attempted: sourcesAttempted,
    sources_succeeded: sourcesSucceeded,
    sources_failed: sourcesFailed,
    documents_collected: documentsCollected,
    atomic_claims_created: atomicClaimsCreated,
    events_created: eventsCreated,
    events_skipped: eventsSkipped,
    precognition_processed: precogProcessed,
    notes,
  };

});

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

type SynthEvent = {
  title: string;
  event_type: string;
  event_class: "risk" | "opportunity" | "mixed" | "watch" | "unknown";
  summary: string;
  severity: "low" | "moderate" | "high" | "critical";
  probability: number;
  confidence: number;
  risk_score: number;
  opportunity_score: number;
};

type SynthImpact = {
  company: string;
  impact_type: "beneficiary" | "harmed" | "mixed" | "exposed" | "watch_only" | "unknown";
  pathway: string;
  risk_score: number;
  opportunity_score: number;
  watch_signals: string[];
  confidence: number;
};

type SynthOpportunity = {
  title: string;
  opportunity_type: string;
  summary: string;
  buyer_pain: string;
  likely_buyers: string[];
  suggested_offer: string;
  urgency_score: number;
  commercial_value_score: number;
  confidence: number;
  opportunity_logic: string;
  next_best_action: string;
};

type SynthPositioning = {
  title: string;
  user_type: string;
  positioning_angle: string;
  how_it_could_be_used: string;
  why_it_may_matter: string;
  constraints: string;
  confidence: number;
};

type NormalisedSynthesis = {
  event: SynthEvent;
  impacts: SynthImpact[];
  opportunity: SynthOpportunity | null;
  positioning: SynthPositioning | null;
  contradictions: string[];
};

type SynthContext = {
  key: string;
  type: string;
  sector: string;
  region: string;
  entities: string[];
  commodities: string[];
  claimCount: number;
  sourceCount: number;
  avgReliability: number;
};

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function text(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function textList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => text(x)).filter(Boolean) : [];
}

function eventClass(v: unknown, risk: number, opportunity: number): SynthEvent["event_class"] {
  const s = text(v).toLowerCase();
  if (["risk", "opportunity", "mixed", "watch", "unknown"].includes(s)) return s as SynthEvent["event_class"];
  if (risk >= 0.55 && opportunity >= 0.55) return "mixed";
  if (opportunity > risk && opportunity >= 0.45) return "opportunity";
  if (risk >= 0.45) return "risk";
  return "watch";
}

function severity(v: unknown, risk: number): SynthEvent["severity"] {
  const s = text(v).toLowerCase();
  if (["low", "moderate", "high", "critical"].includes(s)) return s as SynthEvent["severity"];
  if (risk >= 0.85) return "critical";
  if (risk >= 0.65) return "high";
  if (risk >= 0.35) return "moderate";
  return "low";
}

function impactType(v: unknown, risk: number, opportunity: number): SynthImpact["impact_type"] {
  const s = text(v).toLowerCase();
  if (["beneficiary", "harmed", "mixed", "exposed", "watch_only", "unknown"].includes(s)) return s as SynthImpact["impact_type"];
  if (risk >= 0.5 && opportunity >= 0.5) return "mixed";
  if (opportunity > risk && opportunity >= 0.45) return "beneficiary";
  if (risk >= 0.45) return "exposed";
  return "watch_only";
}

function normaliseSynthesis(payload: unknown, ctx: SynthContext): NormalisedSynthesis | null {
  const root = record(payload);
  if (!root) return null;
  const eventRaw = root.event;
  const evObj = record(eventRaw);
  const title = text(evObj?.title, text(evObj?.name, typeof eventRaw === "string" ? eventRaw : `${ctx.type} signal in ${ctx.sector}`));
  const summary = text(evObj?.summary, text(evObj?.description, title));
  if (!title || !summary) return null;
  const riskScore = clamp01(evObj?.risk_score ?? evObj?.risk ?? evObj?.riskScore ?? 0.45);
  const opportunityScore = clamp01(evObj?.opportunity_score ?? evObj?.opportunity ?? evObj?.opportunityScore ?? 0.45);
  const event: SynthEvent = {
    title,
    event_type: text(evObj?.event_type, text(evObj?.type, ctx.type || "public_signal")),
    event_class: eventClass(evObj?.event_class ?? evObj?.class, riskScore, opportunityScore),
    summary,
    severity: severity(evObj?.severity, riskScore),
    probability: clamp01(evObj?.probability ?? evObj?.likelihood ?? 0.5),
    confidence: clamp01(evObj?.confidence ?? ctx.avgReliability),
    risk_score: riskScore,
    opportunity_score: opportunityScore,
  };

  const impacts = (Array.isArray(root.impacts) ? root.impacts : [])
    .map((item): SynthImpact | null => {
      const im = record(item);
      if (!im) return null;
      const imRisk = clamp01(im.risk_score ?? im.risk ?? 0.4);
      const imOpp = clamp01(im.opportunity_score ?? im.opportunity ?? 0.4);
      const company = text(im.company, text(im.company_name, text(im.entity, ctx.entities[0] ?? ctx.sector)));
      const pathway = text(im.pathway, text(im.description, text(im.mechanism, summary)));
      if (!company || !pathway) return null;
      return {
        company,
        impact_type: impactType(im.impact_type ?? im.direction, imRisk, imOpp),
        pathway,
        risk_score: imRisk,
        opportunity_score: imOpp,
        watch_signals: textList(im.watch_signals ?? im.tags).slice(0, 6),
        confidence: clamp01(im.confidence ?? event.confidence),
      };
    })
    .filter((item): item is SynthImpact => !!item);

  const oppObj = record(root.opportunity);
  const opportunityTitle = text(oppObj?.title);
  const opportunitySummary = text(oppObj?.summary, text(oppObj?.description));
  const opportunity = oppObj && opportunityTitle && opportunitySummary ? {
    title: opportunityTitle,
    opportunity_type: text(oppObj.opportunity_type, text(oppObj.type, "commercial_signal")),
    summary: opportunitySummary,
    buyer_pain: text(oppObj.buyer_pain, `Teams exposed to ${ctx.sector} volatility need earlier public-signal visibility.`),
    likely_buyers: textList(oppObj.likely_buyers ?? oppObj.buyers).slice(0, 6),
    suggested_offer: text(oppObj.suggested_offer, "Monitoring, evidence mapping, and briefing support around the flagged public signal."),
    urgency_score: clamp01(oppObj.urgency_score ?? oppObj.urgency ?? opportunityScore),
    commercial_value_score: clamp01(oppObj.commercial_value_score ?? oppObj.value_score ?? opportunityScore),
    confidence: clamp01(oppObj.confidence ?? event.confidence),
    opportunity_logic: text(oppObj.opportunity_logic, opportunitySummary),
    next_best_action: text(oppObj.next_best_action, "Review the supporting evidence and monitor follow-on disclosures."),
  } satisfies SynthOpportunity : null;

  const posObj = record(root.positioning);
  const positioningTitle = text(posObj?.title);
  const positioning = posObj && positioningTitle ? {
    title: positioningTitle,
    user_type: text(posObj.user_type, "strategy team"),
    positioning_angle: text(posObj.positioning_angle, summary),
    how_it_could_be_used: text(posObj.how_it_could_be_used, "Use as a prompt for evidence-led planning and monitoring."),
    why_it_may_matter: text(posObj.why_it_may_matter, summary),
    constraints: text(posObj.constraints, "Public-signal only; validate with primary sources before acting."),
    confidence: clamp01(posObj.confidence ?? event.confidence),
  } satisfies SynthPositioning : null;

  return {
    event,
    impacts,
    opportunity,
    positioning,
    contradictions: textList(root.contradictions).slice(0, 6),
  };
}

type ClaimType = "layoff"|"hiring"|"regulatory"|"procurement"|"supply_chain"|"market"|"commodity"|"company_statement"|"executive"|"legal"|"complaint"|"demand"|"funding"|"macro"|"unknown";
function allowedClaimType(v: string): ClaimType {
  const ok: readonly ClaimType[] = ["layoff","hiring","regulatory","procurement","supply_chain","market","commodity","company_statement","executive","legal","complaint","demand","funding","macro","unknown"];
  return (ok as readonly string[]).includes(v) ? (v as ClaimType) : "unknown";
}

// Small helper: audit log with prompt/response excerpts and repair flag.
async function logTask(
  db: Awaited<ReturnType<typeof admin>>,
  taskType: string,
  r: { ok: boolean; model: string; latencyMs: number; cost: number; error?: string; promptExcerpt?: string; responseExcerpt?: string; repaired?: boolean; data?: unknown },
  stage?: string,
) {
  await db.from("llm_task_logs").insert({
    task_type: taskType,
    provider: "lovable",
    model: r.model,
    status: r.ok ? "ok" : "error",
    latency_ms: r.latencyMs,
    estimated_cost: r.cost,
    validation_status: r.ok && r.data !== null && r.data !== undefined ? (r.repaired ? "valid_after_repair" : "valid") : (r.ok ? "invalid" : "error"),
    error: r.error,
    prompt_excerpt: r.promptExcerpt?.slice(0, 1500),
    response_excerpt: r.responseExcerpt?.slice(0, 1500),
    metadata: { stage: stage ?? null, repaired: !!r.repaired },
  });
}


// ============ MANUAL INTERROGATION SEARCH (deep-research mode) ============
const SearchInput = z.object({
  query: z.string().min(1).max(200),
  kind: z.enum(["auto","company","sector","commodity","ticker","region","theme"]).optional(),
  forceRefresh: z.boolean().optional().default(false),
});

interface LiveNewsItem {
  idx: number;
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  snippet: string;
  query: string;
}

const INTERROGATION_CACHE_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000;
async function interrogationCacheMs(): Promise<number> {
  try { return (await loadScanSettings()).interrogation_cache_ms; } catch { return INTERROGATION_CACHE_MS_DEFAULT; }
}

type SerializableValue = string | number | boolean | null | SerializableValue[] | { [key: string]: SerializableValue };
type SerializableRecord = { [key: string]: SerializableValue };

interface DeepReport {
  subject_profile: string;
  what_is_happening_now: string;
  key_developments: Array<{ headline: string; detail: string; source_indices: number[]; date: string | null }>;
  financial_and_market: string;
  leadership_and_org: string;
  operational_and_projects: string;
  directly_impacted_entities: Array<{ name: string; kind: string; direction: "benefit" | "harm" | "mixed" | "unclear"; mechanism: string; magnitude: "low" | "medium" | "high"; confidence: number; source_indices: number[] }>;
  second_order_effects: Array<{ name: string; kind: string; mechanism: string; direction: "benefit" | "harm" | "mixed" | "unclear"; confidence: number }>;
  risks: Array<{ title: string; description: string; likelihood: number; magnitude: "low" | "medium" | "high"; horizon: "0-7d" | "8-30d" | "1-3mo" | "3-12mo"; source_indices: number[] }>;
  opportunities: Array<{ title: string; description: string; likelihood: number; magnitude: "low" | "medium" | "high"; horizon: "0-7d" | "8-30d" | "1-3mo" | "3-12mo"; source_indices: number[] }>;
  scenarios: Array<{ label: string; horizon: "0-7d" | "8-30d" | "1-3mo" | "3-12mo"; description: string; probability: number; leading_indicators: string[]; source_indices: number[] }>;
  contrarian_or_speculative: Array<{ claim: string; why_it_matters: string; verification_status: "rumor" | "unverified" | "partially_supported"; source_indices: number[] }>;
  what_to_watch: string[];
  confidence_overall: number;
  evidence_coverage: string;
  caveats: string[];
}

function normaliseInterrogationQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

type InterrogationPayload = {
  query: string;
  interrogation_id: string | null;
  subject: { kind: string; canonical: string; adjacent: string[]; rationale: string };
  queries_used: string[];
  live_sources: LiveNewsItem[];
  entities: SerializableRecord[];
  events: SerializableRecord[];
  claims: SerializableRecord[];
  impacts: SerializableRecord[];
  positioning: SerializableRecord[];
  report: DeepReport;
  model: string;
  cache?: {
    cached: boolean;
    created_at: string | null;
    expires_at: string | null;
  };
};

function cacheExpiry(createdAt: string | null, ttlMs: number): string | null {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + ttlMs).toISOString();
}

function hasUsableSynthesis(payload: InterrogationPayload): boolean {
  const report = payload.report;
  if (!report) return false;
  const text = [report.subject_profile, report.what_is_happening_now, report.financial_and_market, report.operational_and_projects]
    .filter(Boolean)
    .join(" ")
    .trim();
  const hasStructuredFindings =
    (report.key_developments?.length ?? 0) > 0 ||
    (report.risks?.length ?? 0) > 0 ||
    (report.opportunities?.length ?? 0) > 0 ||
    (report.scenarios?.length ?? 0) > 0;
  const failedPlaceholder =
    /no synthesis available/i.test(report.subject_profile ?? "") ||
    /model call failed/i.test(report.evidence_coverage ?? "");
  const fallbackOnly = (report.caveats ?? []).some((c) => /fallback report generated/i.test(c));
  return !failedPlaceholder && !fallbackOnly && (text.length > 80 || hasStructuredFindings);
}

async function loadCachedInterrogation(db: Awaited<ReturnType<typeof admin>>, q: string): Promise<InterrogationPayload | null> {
  const normalised = normaliseInterrogationQuery(q);
  const ttl = await interrogationCacheMs();
  const threshold = new Date(Date.now() - ttl).toISOString();
  const { data: rows } = await db
    .from("investigation_queries")
    .select("id, query_text, created_at, metadata")
    .eq("status", "completed")
    .gte("created_at", threshold)
    .order("created_at", { ascending: false })
    .limit(80);

  for (const row of rows ?? []) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const rowNormalised = typeof metadata.normalised_query === "string"
      ? metadata.normalised_query
      : normaliseInterrogationQuery(row.query_text ?? "");
    if (rowNormalised !== normalised) continue;
    const payload = metadata.result_payload as unknown as InterrogationPayload | undefined;
    if (!payload || typeof payload !== "object") continue;
    if (!hasUsableSynthesis(payload)) continue;
    return {
      ...payload,
      interrogation_id: payload.interrogation_id ?? row.id,
      cache: {
        cached: true,
        created_at: row.created_at ?? null,
        expires_at: cacheExpiry(row.created_at ?? null, ttl),
      },
    };
  }
  return null;
}

function fallbackReportFromEvidence(args: {
  q: string;
  subject: { kind: string; canonical: string; adjacent: string[]; rationale: string };
  liveItems: LiveNewsItem[];
  error?: string;
}): DeepReport {
  const { q, subject, liveItems, error } = args;
  const name = subject.canonical || q;
  const cited = liveItems.slice(0, 8);
  const recentTitles = cited.map((item) => item.title).filter(Boolean);
  const sourceIndices = cited.map((item) => item.idx);
  const adjacent = (subject.adjacent ?? []).slice(0, 6);
  const isCompany = subject.kind === "company" || subject.kind === "ticker";
  const profileBase = `${name} is classified by Archlight as a ${subject.kind}. ${subject.rationale || "The classification is based on public identity signals and query context."}`;
  const evidenceLine = cited.length
    ? `The current evidence bundle contains ${cited.length} live public-news items, including ${recentTitles.slice(0, 4).join("; ")}.`
    : "The live news retrieval layer returned no current items, so this report is limited to identity-level context and should be refreshed when source access improves.";

  return {
    subject_profile: `${profileBase} ${evidenceLine}`,
    what_is_happening_now: cited.length
      ? `Archlight retrieved recent public signals for ${name}. The strongest immediate reading is a watch brief rather than a definitive event call: current items should be reviewed for regulatory, product, client-flow, operational, and sector-read-across implications before drawing conclusions.`
      : `Archlight could not retrieve enough live items for ${name} in this run. Treat this as a thin-evidence identity brief, not a complete interrogation.`,
    key_developments: cited.map((item) => ({
      headline: item.title,
      detail: item.snippet || `Public item from ${item.source || "unknown source"}.`,
      source_indices: [item.idx],
      date: item.publishedAt,
    })),
    financial_and_market: isCompany
      ? `${name}'s market context should be read through revenue mix, assets or order-book exposure, client demand, pricing pressure, regulatory scrutiny, peer performance, and any listed-parent or comparable-company signals. This fallback summary avoids share recommendations and should be refreshed for a fuller market synthesis.`
      : `Market relevance depends on which companies, commodities, sectors, or regions are exposed to ${name}. A refreshed synthesis should quantify the listed entities and comparable peers affected.`,
    leadership_and_org: `No dedicated leadership-change synthesis was produced in this run. Watch for executive appointments, restructuring, governance filings, regulatory correspondence, and senior public statements connected to ${name}.`,
    operational_and_projects: `Operational watch areas include product launches, platform availability, contract awards or losses, legal/regulatory actions, supply-chain dependencies, customer concentration, and regional exposure tied to ${name}.`,
    directly_impacted_entities: [
      { name, kind: subject.kind, direction: "mixed", mechanism: "Primary subject of the interrogation; impact depends on the confirmed developments in retrieved evidence.", magnitude: cited.length ? "medium" : "low", confidence: cited.length ? 0.55 : 0.25, source_indices: sourceIndices },
      ...adjacent.slice(0, 5).map((entity) => ({ name: entity, kind: "adjacent", direction: "unclear" as const, mechanism: `Adjacent entity or theme identified during subject classification for ${name}.`, magnitude: "low" as const, confidence: 0.35, source_indices: [] })),
    ],
    second_order_effects: adjacent.map((entity) => ({
      name: entity,
      kind: "adjacent",
      mechanism: `${entity} may show read-across from ${name} through competition, regulation, customers, suppliers, policy, or sector sentiment depending on the confirmed event pathway.`,
      direction: "unclear" as const,
      confidence: 0.35,
    })),
    risks: [
      { title: "Thin-evidence risk", description: `The synthesis layer did not complete a full deep report for ${name}, so hidden developments may be missed until the query is refreshed.`, likelihood: 0.6, magnitude: "medium", horizon: "0-7d", source_indices: sourceIndices },
      { title: "Regulatory and reputational read-across", description: `${name} may face or transmit risk through regulatory attention, client confidence, counterparties, or sector sentiment if current public items point to adverse scrutiny.`, likelihood: 0.45, magnitude: "medium", horizon: "8-30d", source_indices: sourceIndices },
    ],
    opportunities: [
      { title: "Evidence-driven monitoring opportunity", description: `A refreshed interrogation can convert the current public signals around ${name} into specific watch triggers for affected companies, sectors, regions, and commodities.`, likelihood: 0.55, magnitude: "medium", horizon: "0-7d", source_indices: sourceIndices },
    ],
    scenarios: [
      { label: "Fresh public signals clarify the pathway", horizon: "0-7d", description: `Additional retrieved sources could identify whether ${name} is facing operational, regulatory, market, or competitive pressure and which entities are exposed.`, probability: 0.55, leading_indicators: [`More source hits for ${name}`, "Regulatory filings or statements", "Peer or competitor reactions"], source_indices: sourceIndices },
      { label: "Sector read-across builds", horizon: "1-3mo", description: `If the topic persists in public sources, adjacent entities such as ${adjacent.slice(0, 3).join(", ") || "sector peers"} could show second-order effects.`, probability: 0.4, leading_indicators: ["Repeated mentions across independent sources", "Comparable-company updates", "Policy or client-flow changes"], source_indices: sourceIndices },
    ],
    contrarian_or_speculative: [],
    what_to_watch: [
      `New source hits for ${name}`,
      "Independent confirmation across multiple publishers",
      "Regulatory filings, lawsuits, tenders, contract notices, or official statements",
      "Peer and competitor read-across",
      "Regional or sector-specific policy changes",
    ],
    confidence_overall: cited.length ? 0.42 : 0.18,
    evidence_coverage: cited.length
      ? `Fallback synthesis from ${cited.length} retrieved live items because the full model synthesis did not return usable JSON.`
      : "Fallback synthesis only; no live items were retrieved for this run.",
    caveats: [
      "Fallback report generated to avoid an empty interrogation result.",
      ...(error ? [error] : []),
    ],
  };
}

/** Fetch Google News RSS results for one query. Free, no API key. */
async function fetchGoogleNews(query: string, limit = 8): Promise<Omit<LiveNewsItem, "idx">[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    let xml = "";
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "ArchlightBot/0.1 (+public-signals)" },
      });
      if (!res.ok) return [];
      xml = await res.text();
    } finally {
      clearTimeout(timeout);
    }
    const items = parseNewsRss(xml);
    return items.slice(0, limit).map((it) => {
      const srcMatch = it.description.match(/([A-Z][A-Za-z0-9 .&'|:-]{2,80})$/);
      const source = srcMatch ? srcMatch[1].trim() : "unknown";
      return { title: it.title, link: it.link, source, publishedAt: it.publishedAt, snippet: it.description.slice(0, 400), query };
    });
  } catch {
    return [];
  }
}

function parseNewsRss(xml: string): Array<{ title: string; link: string; description: string; publishedAt: string | null }> {
  const items: Array<{ title: string; link: string; description: string; publishedAt: string | null }> = [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = stripXml(pickXml(block, "title")).slice(0, 300);
    const rawLink = stripXml(pickXml(block, "link"));
    const guid = stripXml(pickXml(block, "guid"));
    const link = rawLink || guid;
    const description = stripXml(pickXml(block, "description")).slice(0, 1200);
    const pub = stripXml(pickXml(block, "pubDate"));
    if (!title) continue;
    items.push({ title, link, description, publishedAt: safeIsoDate(pub) });
  }
  return items;
}

function pickXml(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ?? "";
}

function stripXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Classify the subject so we can build sharper follow-up queries. */
async function classifySubject(q: string): Promise<{ kind: string; canonical: string; adjacent: string[]; rationale: string }> {
  const res = await callJson<{ kind: string; canonical: string; adjacent: string[]; rationale: string }>({
    task: "query_generation",
    system: "Classify a user's interrogation query for a public-signals engine. Return JSON: {\"kind\": one of company|country|region|commodity|sector|ticker|person|theme|event, \"canonical\": string (the cleaned name), \"adjacent\": string[] (3-6 things directly linked — competitors, suppliers, related commodities, neighbouring countries, sector peers, key customers, related regulators), \"rationale\": string (one sentence)}. Do not invent data — use only public general knowledge about identities/relationships.",
    user: `Query: ${q}`,
  });
  return res.data ?? { kind: "theme", canonical: q, adjacent: [], rationale: "" };
}

/** Build targeted news queries for the subject type. */
function buildQueries(kind: string, canonical: string, adjacent: string[]): string[] {
  const q = canonical;
  const base: string[] = [q];
  if (kind === "company" || kind === "ticker") {
    base.push(
      `${q} earnings OR revenue OR guidance`,
      `${q} layoffs OR restructuring OR CEO`,
      `${q} contract OR acquisition OR investigation OR lawsuit`,
      `${q} share price OR analyst`,
      `${q} competitors`,
    );
  } else if (kind === "commodity") {
    base.push(
      `${q} price`,
      `${q} supply OR shortage OR harvest`,
      `${q} weather OR drought OR flood`,
      `${q} export OR tariff OR sanctions`,
    );
  } else if (kind === "country" || kind === "region") {
    base.push(
      `${q} economy OR inflation OR central bank`,
      `${q} election OR government OR policy`,
      `${q} conflict OR sanctions OR trade`,
      `${q} weather disaster OR flood OR drought OR wildfire`,
    );
  } else if (kind === "sector") {
    base.push(
      `${q} sector outlook`,
      `${q} regulation OR policy`,
      `${q} layoffs OR earnings`,
      `${q} contracts OR mergers`,
    );
  } else if (kind === "person") {
    base.push(`${q} statement`, `${q} appointment OR resignation`, `${q} controversy`);
  } else {
    base.push(`${q} latest`, `${q} impact`, `${q} risk`, `${q} opportunity`);
  }
  for (const a of adjacent.slice(0, 3)) base.push(`${a} ${q}`);
  return Array.from(new Set(base)).slice(0, 8);
}

export const interrogate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchInput.parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const q = data.query.trim();

    if (!data.forceRefresh) {
      const cached = await loadCachedInterrogation(db, q);
      if (cached) return cached;
    }

    // 1. Classify subject and design queries
    const subject = await classifySubject(q);
    const queries = buildQueries(subject.kind, subject.canonical || q, subject.adjacent ?? []);

    // 2. Pull live news in parallel (free, no API key)
    const rawBatches = await Promise.all(queries.map((qq) => fetchGoogleNews(qq, 6)));
    const seenLinks = new Set<string>();
    const liveItems: LiveNewsItem[] = [];
    let idx = 1;
    for (const batch of rawBatches) {
      for (const item of batch) {
        const key = item.link || item.title;
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        liveItems.push({ idx: idx++, ...item });
        if (liveItems.length >= 40) break;
      }
      if (liveItems.length >= 40) break;
    }

    // 3. Pull local Archlight evidence
    const [{ data: entities }, { data: events }, { data: claims }, { data: impacts }, { data: positioning }] = await Promise.all([
      db.from("entities").select("*").or(`canonical_name.ilike.%${q}%,ticker.ilike.%${q}%`).limit(6),
      db.from("event_candidates").select("id, title, event_class, summary, risk_score, opportunity_score, confidence, affected_sector, affected_region, last_updated_at").or(`title.ilike.%${q}%,affected_sector.ilike.%${q}%,affected_region.ilike.%${q}%,summary.ilike.%${q}%`).order("last_updated_at", { ascending: false }).limit(12),
      db.from("canonical_claims").select("*").ilike("claim_text", `%${q}%`).order("updated_at", { ascending: false }).limit(12),
      db.from("company_impacts").select("*").ilike("company_name", `%${q}%`).order("updated_at", { ascending: false }).limit(12),
      db.from("strategic_positioning").select("*").ilike("how_it_could_be_used", `%${q}%`).limit(6),
    ]);

    // 4. Build evidence bundle for the reasoning model (compact, indexed for citations)
    const evidenceBundle = {
      subject,
      live_news: liveItems.map((n) => ({ i: n.idx, title: n.title, source: n.source, publishedAt: n.publishedAt, snippet: n.snippet, url: n.link, query: n.query })),
      local_events: (events ?? []).map((e) => ({ id: e.id, title: e.title, class: e.event_class, risk: e.risk_score, opp: e.opportunity_score, conf: e.confidence, sector: e.affected_sector, region: e.affected_region, summary: (e.summary ?? "").slice(0, 240) })),
      local_claims: (claims ?? []).map((c) => ({ id: c.id, text: c.claim_text.slice(0, 240), factuality: c.factuality, repeats: c.repeat_count })),
      local_company_impacts: (impacts ?? []).map((i) => ({ id: i.id, company: i.company_name, type: i.impact_type, pathway: i.impact_pathway, risk: i.risk_score, opp: i.opportunity_score })),
      local_positioning: (positioning ?? []).map((p) => ({ id: p.id, title: p.title, user_type: p.user_type, how: p.how_it_could_be_used })),
      known_entities: (entities ?? []).map((e) => ({ id: e.id, name: e.canonical_name, type: e.entity_type, ticker: e.ticker, sector: e.sector, region: e.region })),
    };

    // 5. Deep synthesis with a strong reasoning model. Cite live_news items by integer index.
    const brief = await callJson<DeepReport>({
      task: "report_synthesis",
      system: `You are Archlight, a precognitive public-signals analyst. You are given LIVE news (indexed 1..N) plus internal Archlight evidence. Produce a DEEP interrogation of the subject, treating live_news as the primary factual base. Cover: identity/profile, what is happening NOW, financial/market context (earnings, guidance, share-price direction, analyst tone), leadership/org changes, operational events (contracts, tenders, projects, layoffs, lawsuits, regulatory), directly impacted entities (name every company, country, commodity, sector mentioned in evidence), second-order effects (suppliers, customers, competitors, adjacent commodities, neighbouring regions), ranked risks and opportunities across horizons 0-7d / 8-30d / 1-3mo / 3-12mo, plausible scenarios with probabilities and leading indicators, and contrarian/rumor/speculative signals separated from confirmed items. Every claim MUST cite live_news indices in source_indices (integer array) when it originates from those sources. Use hedged wording. DO NOT give financial advice: never say buy/sell/hold, no target price, no investment recommendation, no portfolio allocation, no "guaranteed" language. Return STRICT JSON matching the requested schema. If the live_news set is thin, say so in evidence_coverage and lower confidence_overall.`,
      user: `USER QUERY: ${q}\nSUBJECT CLASSIFICATION: ${JSON.stringify(subject)}\nEVIDENCE BUNDLE:\n${JSON.stringify(evidenceBundle, null, 2)}\n\nReturn JSON with fields: subject_profile, what_is_happening_now, key_developments[{headline,detail,source_indices,date}], financial_and_market, leadership_and_org, operational_and_projects, directly_impacted_entities[{name,kind,direction,mechanism,magnitude,confidence,source_indices}], second_order_effects[{name,kind,mechanism,direction,confidence}], risks[{title,description,likelihood,magnitude,horizon,source_indices}], opportunities[{title,description,likelihood,magnitude,horizon,source_indices}], scenarios[{label,horizon,description,probability,leading_indicators,source_indices}], contrarian_or_speculative[{claim,why_it_matters,verification_status,source_indices}], what_to_watch[], confidence_overall (0..1), evidence_coverage, caveats[].`,
      temperature: 0.3,
      maxTokens: 8192,
    });

    let report: DeepReport | null = brief.data;
    if (report) {
      const guard = guardFinancialAdvice(JSON.stringify(report));
      if (!guard.ok) {
        report = {
          subject_profile: `Redacted: guardrail violation (${guard.violations.join(", ")}).`,
          what_is_happening_now: "", key_developments: [], financial_and_market: "", leadership_and_org: "",
          operational_and_projects: "", directly_impacted_entities: [], second_order_effects: [],
          risks: [], opportunities: [], scenarios: [], contrarian_or_speculative: [],
          what_to_watch: [], confidence_overall: 0,
          evidence_coverage: "Model output rejected by financial-advice guardrail.",
          caveats: ["Guardrail rejection — output suppressed."],
        };
      }
    }
    const hasSynthesis = report
      ? hasUsableSynthesis({
        query: q,
        interrogation_id: null,
        subject,
        queries_used: queries,
        live_sources: liveItems,
        entities: [],
        events: [],
        claims: [],
        impacts: [],
        positioning: [],
        report,
        model: brief.model,
      })
      : false;
    if (!hasSynthesis) {
      report = fallbackReportFromEvidence({ q, subject, liveItems, error: brief.error });
    }

    await logTask(db, "report_synthesis", brief, `interrogation:${subject.kind}`);

    const evidenceIds = [
      ...((events ?? []).map((e) => e.id)),
      ...((claims ?? []).map((c) => c.id)),
      ...((impacts ?? []).map((i) => i.id)),
    ];
    const payload: InterrogationPayload = {
      query: q,
      interrogation_id: null,
      subject,
      queries_used: queries,
      live_sources: liveItems,
      entities: (entities ?? []).map((e) => ({
        id: e.id,
        canonical_name: e.canonical_name,
        entity_type: e.entity_type,
        ticker: e.ticker,
        sector: e.sector,
        region: e.region,
      })) as SerializableRecord[],
      events: (events ?? []).map((e) => ({
        id: e.id,
        title: e.title,
        event_class: e.event_class,
        summary: e.summary,
        risk_score: Number(e.risk_score),
        opportunity_score: Number(e.opportunity_score),
        confidence: Number(e.confidence),
        affected_sector: e.affected_sector,
        affected_region: e.affected_region,
        last_updated_at: e.last_updated_at,
      })) as SerializableRecord[],
      claims: (claims ?? []).map((c) => ({
        id: c.id,
        claim_text: c.claim_text,
        factuality: c.factuality,
        repeat_count: c.repeat_count,
        support_score: Number(c.support_score),
      })) as SerializableRecord[],
      impacts: (impacts ?? []).map((i) => ({
        id: i.id,
        company_name: i.company_name,
        impact_type: i.impact_type,
        impact_pathway: i.impact_pathway,
        risk_score: Number(i.risk_score),
        opportunity_score: Number(i.opportunity_score),
        confidence: Number(i.confidence),
      })) as SerializableRecord[],
      positioning: (positioning ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        user_type: p.user_type,
        how_it_could_be_used: p.how_it_could_be_used,
        confidence: Number(p.confidence),
      })) as SerializableRecord[],
      report: report ?? {
        subject_profile: "No synthesis available.", what_is_happening_now: "", key_developments: [],
        financial_and_market: "", leadership_and_org: "", operational_and_projects: "",
        directly_impacted_entities: [], second_order_effects: [], risks: [], opportunities: [],
        scenarios: [], contrarian_or_speculative: [], what_to_watch: [], confidence_overall: 0,
        evidence_coverage: "Model call failed.", caveats: [brief.error ?? "unknown error"],
      },
      model: brief.model,
      cache: { cached: false, created_at: null, expires_at: null },
    };

    const { data: iqRow } = await db.from("investigation_queries").insert({
      query_text: q,
      query_class: `interrogation:${subject.kind}`,
      status: "completed",
      result_count: liveItems.length + evidenceIds.length,
      brief_synth: (report ?? null) as never,
      evidence_ids: evidenceIds,
      metadata: {
        model: brief.model,
        repaired: !!brief.repaired,
        live_source_count: liveItems.length,
        queries,
        normalised_query: normaliseInterrogationQuery(q),
        cache_ttl_days: 7,
        result_payload: payload,
      } as never,
    }).select("id").single();

    return { ...payload, interrogation_id: iqRow?.id ?? null };
  });


// ============ EVENT DETAIL ============
const EventInput = z.object({ id: z.string().uuid() });
export const getEventDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => EventInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [ev, impacts, opps, positioning, evNode, contradictions] = await Promise.all([
      db.from("event_candidates").select("*").eq("id", data.id).maybeSingle(),
      db.from("company_impacts").select("*").eq("event_candidate_id", data.id),
      db.from("opportunity_cards").select("*").eq("event_candidate_id", data.id),
      db.from("strategic_positioning").select("*").eq("event_candidate_id", data.id),
      db.from("graph_nodes").select("id").eq("ref_type", "event_candidate").eq("ref_id", data.id).maybeSingle(),
      db.from("review_queue").select("id, reason, status, created_at").eq("item_type", "contradiction").eq("item_id", data.id).order("created_at", { ascending: false }),
    ]);

    type JsonVal = string | number | boolean | null | JsonVal[] | { [k: string]: JsonVal };
    let arc: { nodes: JsonVal[]; edges: JsonVal[] } = { nodes: [], edges: [] };
    if (evNode.data?.id) {
      const nodeId = evNode.data.id;
      const { data: edges } = await db.from("graph_edges").select("*").or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`).limit(60);
      const nodeIds = new Set<string>([nodeId]);
      (edges ?? []).forEach((e) => { nodeIds.add(e.source_node_id); nodeIds.add(e.target_node_id); });
      const { data: nodes } = await db.from("graph_nodes").select("*").in("id", Array.from(nodeIds));
      arc = { nodes: (nodes ?? []) as unknown as JsonVal[], edges: (edges ?? []) as unknown as JsonVal[] };
    }

    // Supporting atomic claims: union of evidence_ids across impacts
    const evIds = Array.from(new Set((impacts.data ?? []).flatMap((i) => (i.evidence_ids ?? []) as string[]))).slice(0, 40);
    type SupportingClaim = {
      id: string;
      claim_text: string;
      claim_type: string;
      factuality_label: string | null;
      extraction_confidence: number | null;
      specificity_score: number | null;
      canonical_claim_id: string | null;
      canonical_text: string | null;
      canonical_reliability: number | null;
      canonical_repeat_count: number | null;
      canonical_independent_sources: number | null;
      canonical_factuality: string | null;
      source_id: string;
      source_name: string | null;
      document_url: string | null;
      lineage: Array<{ source_name: string | null; url: string | null; published_at: string | null; relation: string | null; is_likely_copy: boolean | null; origin_confidence: number | null }>;
    };
    let supporting: SupportingClaim[] = [];
    if (evIds.length) {
      const { data: atomics } = await db.from("atomic_claims").select("id, claim_text, claim_type, factuality_label, extraction_confidence, specificity_score, canonical_claim_id, source_id, document_id").in("id", evIds);
      const canonicalIds = Array.from(new Set((atomics ?? []).map((a) => a.canonical_claim_id).filter((x): x is string => !!x)));
      const sourceIds = Array.from(new Set((atomics ?? []).map((a) => a.source_id)));
      const docIds = Array.from(new Set((atomics ?? []).map((a) => a.document_id).filter((x): x is string => !!x)));
      const [canRes, srcRes, docRes, linRes] = await Promise.all([
        canonicalIds.length ? db.from("canonical_claims").select("id, claim_text, reliability_score, repeat_count, independent_source_count, factuality").in("id", canonicalIds) : Promise.resolve({ data: [] }),
        sourceIds.length ? db.from("sources").select("id, name").in("id", sourceIds) : Promise.resolve({ data: [] }),
        docIds.length ? db.from("documents").select("id, url").in("id", docIds) : Promise.resolve({ data: [] }),
        canonicalIds.length ? db.from("claim_lineage").select("canonical_claim_id, source_id, url, published_at, relation_to_origin, is_likely_copy, origin_confidence").in("canonical_claim_id", canonicalIds).order("published_at", { ascending: true }) : Promise.resolve({ data: [] }),
      ]);
      const canMap = new Map(((canRes.data ?? []) as Array<{ id: string; claim_text: string; reliability_score: number | null; repeat_count: number | null; independent_source_count: number | null; factuality: string | null }>).map((c) => [c.id, c] as const));
      const srcMap = new Map(((srcRes.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));
      const docMap = new Map(((docRes.data ?? []) as Array<{ id: string; url: string | null }>).map((d) => [d.id, d.url] as const));
      const lineageMap = new Map<string, SupportingClaim["lineage"]>();
      for (const l of ((linRes.data ?? []) as Array<{ canonical_claim_id: string; source_id: string; url: string | null; published_at: string | null; relation_to_origin: string | null; is_likely_copy: boolean | null; origin_confidence: number | null }>)) {
        const arr = lineageMap.get(l.canonical_claim_id) ?? [];
        arr.push({
          source_name: srcMap.get(l.source_id) ?? null,
          url: l.url,
          published_at: l.published_at,
          relation: l.relation_to_origin,
          is_likely_copy: l.is_likely_copy,
          origin_confidence: l.origin_confidence,
        });
        lineageMap.set(l.canonical_claim_id, arr);
      }
      supporting = (atomics ?? []).map((a) => {
        const can = a.canonical_claim_id ? canMap.get(a.canonical_claim_id) : undefined;
        return {
          id: a.id,
          claim_text: a.claim_text,
          claim_type: a.claim_type,
          factuality_label: a.factuality_label,
          extraction_confidence: a.extraction_confidence,
          specificity_score: a.specificity_score,
          canonical_claim_id: a.canonical_claim_id,
          canonical_text: can?.claim_text ?? null,
          canonical_reliability: can?.reliability_score ?? null,
          canonical_repeat_count: can?.repeat_count ?? null,
          canonical_independent_sources: can?.independent_source_count ?? null,
          canonical_factuality: can?.factuality ?? null,
          source_id: a.source_id,
          source_name: srcMap.get(a.source_id) ?? null,
          document_url: a.document_id ? docMap.get(a.document_id) ?? null : null,
          lineage: a.canonical_claim_id ? lineageMap.get(a.canonical_claim_id) ?? [] : [],
        };
      });
    }

    return {
      event: ev.data,
      impacts: impacts.data ?? [],
      opportunities: opps.data ?? [],
      positioning: positioning.data ?? [],
      arc,
      supporting_claims: supporting,
      contradictions: contradictions.data ?? [],
    };
  });

// ============ REGISTRY / HEALTH / SCANS ============
export const getSourceRegistry = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("sources").select("*").order("reliability_score", { ascending: false });
  return { sources: data ?? [] };
});

export const getReviewQueue = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("review_queue").select("*").order("created_at", { ascending: false }).limit(100);
  return { items: data ?? [] };
});

export const getScanHistory = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  // Reap stale RUNNING scans so the page doesn't show ghost "running" rows
  // from worker terminations that never got to finalise the row.
  try {
    await reapStaleRunningScans(db);
  } catch { /* best-effort */ }
  const [runs, logs] = await Promise.all([
    db.from("scan_runs").select("*").order("started_at", { ascending: false }).limit(30),
    db.from("llm_task_logs").select("id, task_type, provider, model, status, latency_ms, estimated_cost, validation_status, error, created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  return { runs: runs.data ?? [], logs: logs.data ?? [] };
});

export const getRoutingInfo = createServerFn({ method: "GET" }).handler(async () => {
  return {
    router: {
      atomic_claim_extraction: pickModel("atomic_claim_extraction"),
      claim_normalisation: pickModel("claim_normalisation"),
      query_generation: pickModel("query_generation"),
      contradiction_analysis: pickModel("contradiction_analysis"),
      source_comparison: pickModel("source_comparison"),
      company_impact_analysis: pickModel("company_impact_analysis"),
      historic_context: pickModel("historic_context"),
      present_context: pickModel("present_context"),
      future_scenarios: pickModel("future_scenarios"),
      strategic_positioning: pickModel("strategic_positioning"),
      report_synthesis: pickModel("report_synthesis"),
      json_repair: pickModel("json_repair"),
      embedding: pickModel("embedding"),
    },
    principles: [
      "Cheap fast models for tagging and first-pass extraction",
      "Strong reasoning for company impact, positioning, and scenarios",
      "Embeddings collapse 'same story, different words' clusters",
      "Copy-loop hygiene flagged via 5-word shingle Jaccard against recent docs",
      "All outputs schema-validated, JSON-repair retried once when parse fails",
      "Every output passes the financial-advice guardrail",
      "All model calls audit-logged with latency, cost, and prompt/response excerpts",
    ],
  };
});

// ============ COMPANIES ============
export const getCompanies = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("company_impacts").select("company_name, impact_type, risk_score, opportunity_score, confidence, event_candidate_id, updated_at").order("updated_at", { ascending: false }).limit(300);
  const map = new Map<string, { name: string; events: Set<string>; benefit: number; harm: number; mixed: number; risk: number; opp: number; conf: number; count: number; last: string }>();
  for (const r of data ?? []) {
    const key = r.company_name.toLowerCase();
    const rec = map.get(key) ?? { name: r.company_name, events: new Set(), benefit: 0, harm: 0, mixed: 0, risk: 0, opp: 0, conf: 0, count: 0, last: r.updated_at };
    if (r.event_candidate_id) rec.events.add(r.event_candidate_id);
    if (r.impact_type === "beneficiary") rec.benefit++;
    else if (r.impact_type === "harmed") rec.harm++;
    else rec.mixed++;
    rec.risk += Number(r.risk_score);
    rec.opp += Number(r.opportunity_score);
    rec.conf += Number(r.confidence);
    rec.count++;
    if (r.updated_at > rec.last) rec.last = r.updated_at;
    map.set(key, rec);
  }
  const companies = Array.from(map.values()).map((r) => ({
    name: r.name,
    event_count: r.events.size,
    impact_count: r.count,
    beneficiary_count: r.benefit,
    harmed_count: r.harm,
    mixed_count: r.mixed,
    avg_risk: Number((r.risk / r.count).toFixed(3)),
    avg_opportunity: Number((r.opp / r.count).toFixed(3)),
    avg_confidence: Number((r.conf / r.count).toFixed(3)),
    last_seen_at: r.last,
  })).sort((a, b) => (b.avg_risk + b.avg_opportunity) - (a.avg_risk + a.avg_opportunity));
  return { companies };
});

const CompanyInput = z.object({ name: z.string().min(1).max(240) });
export const getCompanyDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CompanyInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: impacts } = await db.from("company_impacts").select("*").ilike("company_name", data.name).order("updated_at", { ascending: false });
    const eventIds = Array.from(new Set((impacts ?? []).map((i) => i.event_candidate_id).filter((x): x is string => !!x)));
    const [{ data: events }, { data: entity }] = await Promise.all([
      eventIds.length ? db.from("event_candidates").select("id, title, event_class, severity, risk_score, opportunity_score, confidence, affected_sector, affected_region, last_updated_at").in("id", eventIds) : Promise.resolve({ data: [] as Array<{ id: string; title: string; event_class: string; severity: string; risk_score: number; opportunity_score: number; confidence: number; affected_sector: string | null; affected_region: string | null; last_updated_at: string }> }),
      db.from("entities").select("*").eq("entity_type", "company").ilike("canonical_name", data.name).maybeSingle(),
    ]);
    return { name: data.name, impacts: impacts ?? [], events: events ?? [], entity: entity ?? null };
  });

// ============ OPPORTUNITIES ============
export const getOpportunities = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("opportunity_cards").select("*").order("commercial_value_score", { ascending: false }).limit(60);
  return { opportunities: data ?? [] };
});

const IdInput = z.object({ id: z.string().uuid() });
export const getOpportunityDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: opp } = await db.from("opportunity_cards").select("*").eq("id", data.id).maybeSingle();
    if (!opp) return { opportunity: null, event: null, positioning: [] };
    const [{ data: event }, { data: positioning }] = await Promise.all([
      opp.event_candidate_id ? db.from("event_candidates").select("*").eq("id", opp.event_candidate_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("strategic_positioning").select("*").eq("opportunity_card_id", data.id),
    ]);
    return { opportunity: opp, event: event ?? null, positioning: positioning ?? [] };
  });

// ============ SOURCE DETAIL ============
export const getSourceDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: src }, { data: docs }, { data: lineage }] = await Promise.all([
      db.from("sources").select("*").eq("id", data.id).maybeSingle(),
      db.from("documents").select("id, title, url, published_at, fetched_at, is_synthetic, is_likely_copy, copy_loop_score").eq("source_id", data.id).order("fetched_at", { ascending: false }).limit(30),
      db.from("claim_lineage").select("canonical_claim_id, relation_to_origin, is_likely_copy, origin_confidence, published_at").eq("source_id", data.id).order("published_at", { ascending: false }).limit(60),
    ]);
    return { source: src ?? null, documents: docs ?? [], lineage: lineage ?? [] };
  });

// ============ EVIDENCE ARCS ============
export const getEvidenceArcs = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("evidence_arcs").select("*").order("updated_at", { ascending: false }).limit(80);
  return { arcs: data ?? [] };
});
export const getEvidenceArcDetail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ data: arc }, { data: steps }] = await Promise.all([
      db.from("evidence_arcs").select("*").eq("id", data.id).maybeSingle(),
      db.from("evidence_arc_steps").select("*").eq("evidence_arc_id", data.id).order("degree", { ascending: true }),
    ]);
    let event = null;
    if (arc?.root_event_candidate_id) {
      const { data: ev } = await db.from("event_candidates").select("*").eq("id", arc.root_event_candidate_id).maybeSingle();
      event = ev;
    }
    return { arc: arc ?? null, steps: steps ?? [], event };
  });

// ============ INTERROGATIONS ============
export const getInterrogations = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("investigation_queries").select("id, query_text, query_class, status, result_count, evidence_ids, brief_synth, metadata, created_at").order("created_at", { ascending: false }).limit(60);
  return { queries: data ?? [] };
});

// ============ WATCHLISTS + ALERTS ============
const WatchlistCreate = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  sectors: z.array(z.string().min(1).max(60)).max(20).default([]),
  regions: z.array(z.string().min(1).max(60)).max(20).default([]),
  keywords: z.array(z.string().min(1).max(60)).max(20).default([]),
  min_risk: z.number().min(0).max(1).default(0),
  min_opportunity: z.number().min(0).max(1).default(0),
  min_confidence: z.number().min(0).max(1).default(0),
});
export const createWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => WatchlistCreate.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row, error } = await db.from("watchlists").insert(data).select().single();
    if (error) throw new Error(error.message);
    return { watchlist: row };
  });

export const deleteWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("watchlists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWatchlists = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const [{ data: watchlists }, { data: alerts }] = await Promise.all([
    db.from("watchlists").select("*").order("created_at", { ascending: false }),
    db.from("alerts").select("id, watchlist_id, event_candidate_id, reason, severity, seen, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  return { watchlists: watchlists ?? [], alerts: alerts ?? [] };
});

export const markAlertSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    await db.from("alerts").update({ seen: true }).eq("id", data.id);
    return { ok: true };
  });

// Add a subject (company / commodity / region / theme) to an existing watchlist
// by appending it to the appropriate array. Idempotent (dedupes case-insensitively).
const AddToWatchlistInput = z.object({
  watchlist_id: z.string().uuid(),
  kind: z.enum(["keyword", "sector", "region"]).default("keyword"),
  value: z.string().min(1).max(120),
});
export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AddToWatchlistInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const col = data.kind === "sector" ? "sectors" : data.kind === "region" ? "regions" : "keywords";
    const { data: row, error: readErr } = await db.from("watchlists").select(`id, name, ${col}`).eq("id", data.watchlist_id).single();
    if (readErr || !row) throw new Error(readErr?.message ?? "Watchlist not found");
    const existing = ((row as unknown as Record<string, string[]>)[col] ?? []) as string[];
    const norm = data.value.trim();
    if (existing.some((v) => v.toLowerCase() === norm.toLowerCase())) return { ok: true, added: false, watchlist_name: (row as { name: string }).name };
    const next = [...existing, norm];
    const patch = (data.kind === "sector" ? { sectors: next } : data.kind === "region" ? { regions: next } : { keywords: next });
    const { error: upErr } = await db.from("watchlists").update(patch).eq("id", data.watchlist_id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true, added: true, watchlist_name: (row as { name: string }).name };
  });


