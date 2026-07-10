// Shared document → atomic_claims → canonical_claims → claim_lineage ingest
// path. Extracted from pipeline.functions.ts so both the scan intake and the
// GDELT investigation pass reuse the exact same evidence-attachment code.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { callJson, callEmbedding, guardFinancialAdvice, pickModel } from "./ai-gateway.server";
import { shingles, jaccard, shingleSignature, deriveIndependenceGroup } from "./text.server";

export type DbAdmin = SupabaseClient<Database>;

export type ClaimType =
  | "layoff" | "hiring" | "regulatory" | "procurement" | "supply_chain"
  | "market" | "commodity" | "company_statement" | "executive" | "legal"
  | "complaint" | "demand" | "funding" | "macro" | "unknown";

const CLAIM_TYPES: readonly ClaimType[] = [
  "layoff","hiring","regulatory","procurement","supply_chain","market",
  "commodity","company_statement","executive","legal","complaint","demand",
  "funding","macro","unknown",
];
function allowedClaimType(v: string): ClaimType {
  return (CLAIM_TYPES as readonly string[]).includes(v) ? (v as ClaimType) : "unknown";
}

export interface IngestedClaim {
  id: string;
  text: string;
  type: ClaimType;
  sectors: string[];
  regions: string[];
  entities: string[];
  commodities: string[];
  canonical_id: string | null;
  source_id: string;
  source_name: string;
  source_group: string;
  reliability: number;
  doc_id: string;
  doc_url: string;
  embedding: number[] | null;
}

export interface IngestSource {
  id: string;
  name: string;
  reliability_score: number | string | null;
  base_url: string | null;
  feed_url: string | null;
  is_synthetic: boolean | null;
  independence_group?: string | null;
}

export interface IngestOpts {
  src: IngestSource;
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
  isSynthetic: boolean;
  collectedVia: string;
  /** Recent shingle sets to run copy-loop detection against (mutated with the new doc). */
  recentShingleSets?: Array<{ id: string; s: Set<string>; sig: string | null }>;
  /** Jaccard threshold above which the doc is flagged as a likely copy. */
  copyLoopJaccard?: number;
  /** Stage label used in llm_task_logs.metadata for auditing. */
  logStage?: string;
}

export interface IngestResult {
  docId: string | null;
  newClaims: IngestedClaim[];
  atomicsCreated: number;
  notes: string[];
  isLikelyCopy: boolean;
  skipped?: string;
}

async function logTask(
  db: DbAdmin,
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

export async function ingestDocument(db: DbAdmin, opts: IngestOpts): Promise<IngestResult> {
  const { src, title, body, url, publishedAt, isSynthetic, collectedVia } = opts;
  const notes: string[] = [];
  const stage = opts.logStage ?? "ingest";
  const copyLoopJaccard = opts.copyLoopJaccard ?? 0.55;

  const guard = guardFinancialAdvice(`${title} ${body}`);
  if (!guard.ok) {
    notes.push(`Rejected doc from ${src.name}: forbidden language (${guard.violations.join(", ")})`);
    await db.from("llm_task_logs").insert({
      task_type: "atomic_claim_extraction",
      provider: "lovable",
      model: pickModel("atomic_claim_extraction"),
      status: "rejected",
      validation_status: "guardrail_violation",
      error: guard.violations.join(", "),
    });
    return { docId: null, newClaims: [], atomicsCreated: 0, notes, isLikelyCopy: false, skipped: "guardrail" };
  }

  // Copy-loop detection against recent docs.
  const docShingles = shingles(`${title} ${body}`, 5);
  const sig = shingleSignature(`${title} ${body}`);
  let bestJ = 0;
  for (const r of opts.recentShingleSets ?? []) {
    const j = jaccard(docShingles, r.s);
    if (j > bestJ) bestJ = j;
  }
  const isLikelyCopy = bestJ >= copyLoopJaccard;
  const copyLoopScore = Number(bestJ.toFixed(3));

  const { data: doc, error: docErr } = await db.from("documents").insert({
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
  if (!doc) {
    notes.push(`${src.name}: insert doc failed${docErr ? ` — ${docErr.message}` : ""}`);
    return { docId: null, newClaims: [], atomicsCreated: 0, notes, isLikelyCopy, skipped: "insert_failed" };
  }
  if (opts.recentShingleSets) opts.recentShingleSets.push({ id: doc.id, s: docShingles, sig });

  if (isLikelyCopy) notes.push(`Copy-loop flag on ${src.name}: Jaccard ${copyLoopScore} vs recent doc.`);
  notes.push(`${src.name}: collected via ${collectedVia}${isLikelyCopy ? " (flagged as likely copy)" : ""}.`);

  const srcRel = Number(src.reliability_score ?? 0);
  const srcGroup = (src.independence_group ?? "").trim() ||
    deriveIndependenceGroup(src.base_url ?? src.feed_url ?? null, src.name, !!src.is_synthetic, src.id);

  const ext = await callJson<{ claims: Array<{ claim_text: string; claim_type: string; entities: string[]; sectors: string[]; regions: string[]; commodities: string[]; specificity: number }> }>({
    task: "atomic_claim_extraction",
    system: "Extract atomic factual claims from the article. Each claim must be a single verifiable statement, no opinion. Return JSON: {\"claims\":[{\"claim_text\":string,\"claim_type\":one of layoff|hiring|regulatory|procurement|supply_chain|market|commodity|company_statement|executive|legal|complaint|demand|funding|macro|unknown,\"entities\":string[],\"sectors\":string[],\"regions\":string[],\"commodities\":string[],\"specificity\":0..1}]}. Do not invent, do not give financial advice.",
    user: `TITLE: ${doc.title}\n\nBODY: ${doc.body}`,
  });
  await logTask(db, "atomic_claim_extraction", ext, stage);

  const newClaims: IngestedClaim[] = [];
  let atomicsCreated = 0;

  if (ext.ok && ext.data?.claims) {
    for (const c of ext.data.claims) {
      const guard2 = guardFinancialAdvice(c.claim_text);
      if (!guard2.ok) continue;
      const norm = c.claim_text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "-").slice(0, 200);
      const claimType = allowedClaimType(c.claim_type);
      const rel = Math.min(1, 0.4 + srcRel * 0.5);
      const { data: canonical } = await db.from("canonical_claims").upsert({
        claim_text: c.claim_text,
        normalised_claim_text: norm,
        claim_type: claimType,
        first_seen_source_id: src.id,
        origin_candidate_url: doc.url,
        reliability_score: rel,
        factuality: srcRel > 0.8 ? "supported" : "weak_single_source",
      }, { onConflict: "normalised_claim_text" }).select().single();

      let embedding: number[] | null = null;
      if (canonical && !(canonical as { embedding?: unknown }).embedding) {
        const emb = await callEmbedding(c.claim_text);
        if (emb.ok && emb.vector) {
          embedding = emb.vector;
          await db.from("canonical_claims").update({ embedding }).eq("id", canonical.id);
        }
        await db.from("llm_task_logs").insert({
          task_type: "claim_normalisation",
          provider: "lovable",
          model: emb.model,
          status: emb.ok ? "ok" : "error",
          latency_ms: emb.latencyMs,
          validation_status: emb.ok ? "valid" : "invalid",
          error: emb.error,
          prompt_excerpt: `embed: ${c.claim_text.slice(0, 200)}`,
          response_excerpt: emb.ok ? `vec[${emb.vector?.length ?? 0}]` : (emb.error ?? ""),
        });
      } else if (canonical) {
        const existing = (canonical as { embedding?: unknown }).embedding;
        if (Array.isArray(existing)) embedding = existing as number[];
      }

      if (canonical) {
        await db.from("canonical_claims").update({
          repeat_count: (canonical.repeat_count ?? 0) + 1,
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
        factuality_label: srcRel > 0.8 ? "supported" : "weak_single_source",
      }).select().single();
      atomicsCreated++;

      if (canonical && atomic) {
        await db.from("claim_lineage").insert({
          canonical_claim_id: canonical.id,
          source_id: src.id,
          document_id: doc.id,
          url: doc.url,
          published_at: publishedAt ?? new Date().toISOString(),
          relation_to_origin: canonical.first_seen_source_id === src.id ? "origin_candidate" : (isLikelyCopy ? "likely_copy" : "independent_support"),
          is_likely_copy: isLikelyCopy,
          origin_confidence: canonical.first_seen_source_id === src.id ? 0.8 : (isLikelyCopy ? 0.2 : 0.55),
        });

        // Recompute independent_source_count as distinct publisher GROUPS
        // across all lineage rows for this canonical (contradictions excluded).
        const { data: linRows } = await db
          .from("claim_lineage")
          .select("source_id, relation_to_origin")
          .eq("canonical_claim_id", canonical.id);
        const linSrcIds = Array.from(new Set(
          (linRows ?? [])
            .filter((l) => l.relation_to_origin !== "contradiction")
            .map((l) => l.source_id)
            .filter((x): x is string => !!x),
        ));
        let groupCount = 0;
        if (linSrcIds.length) {
          const { data: srcRows } = await db
            .from("sources")
            .select("id, independence_group, base_url, feed_url, name, is_synthetic")
            .in("id", linSrcIds);
          const gset = new Set<string>();
          for (const s of srcRows ?? []) {
            const sr = s as { id: string; independence_group?: string | null; base_url: string | null; feed_url: string | null; name: string; is_synthetic: boolean };
            const g = (sr.independence_group ?? "").trim() ||
              deriveIndependenceGroup(sr.base_url ?? sr.feed_url, sr.name, !!sr.is_synthetic, sr.id);
            if (g) gset.add(g);
          }
          groupCount = gset.size;
        }
        await db.from("canonical_claims").update({
          independent_source_count: groupCount,
        }).eq("id", canonical.id);

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
          source_group: srcGroup,
          reliability: rel,
          doc_id: doc.id,
          doc_url: doc.url ?? "",
          embedding,
        });
      }
    }
  }

  return { docId: doc.id, newClaims, atomicsCreated, notes, isLikelyCopy };
}
