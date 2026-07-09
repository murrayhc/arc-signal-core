import { createHash } from 'node:crypto'
import { prisma } from '@/server/db'
import { extractAtomicClaims } from './extraction'
import { assignCanonicalClaims } from './canonical'
import { traceLineageForMany } from './lineage'
import { scoreReliabilityForMany } from './reliability'
import { generateQueriesForCanonical } from './investigation-query'
import { getActiveSearchAdapters, type SearchAdapter, type SearchDoc } from './search/registry'
import {
  DEFAULT_INVESTIGATION_LIMITS,
  type InvestigationLimits,
  type InvestigationStoppedReason,
  type InvestigationSummary,
} from './types'

export type InvestigationTarget = { canonicalClaimId?: string; eventCandidateId?: string }
export type InvestigationRunOptions = {
  limits?: InvestigationLimits
  /** Inject adapters for tests / future activation. Defaults to the (empty)
   *  registry, i.e. dormant. */
  adapters?: SearchAdapter[]
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** Resolves the canonical claims an event is built on, via its clusters →
 *  signals → documents → atomic claims. Shared with the read service. */
export async function canonicalIdsForEvent(eventCandidateId: string): Promise<string[]> {
  const clusters = await prisma.signalCluster.findMany({ where: { eventCandidateId }, select: { id: true } })
  const links = await prisma.signalClusterSignal.findMany({
    where: { clusterId: { in: clusters.map((c) => c.id) } },
    select: { signal: { select: { documentId: true } } },
  })
  const docIds = [...new Set(links.map((l) => l.signal.documentId))]
  if (docIds.length === 0) return []
  const atomics = await prisma.atomicClaim.findMany({
    where: { documentId: { in: docIds }, canonicalClaimId: { not: null } },
    select: { canonicalClaimId: true },
  })
  return [...new Set(atomics.map((a) => a.canonicalClaimId).filter((x): x is string => !!x))]
}

async function resolveTargets(target: InvestigationTarget): Promise<string[]> {
  if (target.canonicalClaimId) return [target.canonicalClaimId]
  if (target.eventCandidateId) return canonicalIdsForEvent(target.eventCandidateId)
  return []
}

/** Ingests a search result: synthetic source → document → parsed → atomic →
 *  canonical → lineage → reliability. Returns the canonical ids it touched.
 *  Deduped-content documents (unique constraint) are skipped. */
async function ingest(doc: SearchDoc): Promise<string[]> {
  const sourceName = `search:${doc.sourceName ?? 'web'}`
  const source = await prisma.source.upsert({
    where: { name: sourceName },
    create: {
      name: sourceName,
      category: doc.sourceName ? 'NEWS' : 'AGGREGATOR',
      accessMethod: 'SEARCH',
      // Search-ingested sources have NO scan collector (accessMethod SEARCH is
      // not in the collector registry) — stamping them FUNCTIONAL would claim a
      // scan capability that does not exist. Scan-time reconciliation in
      // collect.ts keeps this honest even if a collector lands later.
      collectorStatus: 'UNSUPPORTED',
      isFixture: false,
    },
    update: {},
  })
  const normalised = doc.content.toLowerCase().replace(/\s+/g, ' ').trim()
  let document
  try {
    document = await prisma.document.create({
      data: {
        sourceId: source.id,
        url: doc.url,
        title: doc.title,
        rawContent: doc.content,
        rawContentHash: sha256(doc.content),
        normalisedContentHash: sha256(normalised),
        documentType: 'SEARCH_RESULT',
        publishedAt: doc.publishedAt ?? null,
        isFixture: false,
      },
    })
  } catch {
    // Duplicate content for this source — already ingested.
    return []
  }
  const parsed = await prisma.parsedDocument.create({
    data: {
      documentId: document.id,
      title: doc.title,
      bodyText: doc.content,
      publishedAt: doc.publishedAt ?? null,
      parserName: 'search',
      parserConfidence: 0.5,
    },
  })
  const { atomicClaims } = await extractAtomicClaims(
    [parsed],
    new Map([[document.id, document]]),
    new Map([[source.id, source]]),
  )
  const { affectedCanonicalIds } = await assignCanonicalClaims(atomicClaims)
  await traceLineageForMany(affectedCanonicalIds)
  await scoreReliabilityForMany(affectedCanonicalIds)
  return affectedCanonicalIds
}

/** Runs a bounded, recursive investigation. Dormant-safe: with no configured
 *  adapter it generates follow-up queries, marks them SKIPPED_NO_ADAPTER, and
 *  stops with NO_ADAPTER_CONFIGURED — no external calls, no fabrication. With an
 *  adapter it ingests new evidence, re-scores, and stops on saturation / depth /
 *  limits. Per-adapter failures are swallowed, never crash the run; the same
 *  document is never processed twice. */
export async function runInvestigation(
  target: InvestigationTarget,
  opts: InvestigationRunOptions = {},
): Promise<InvestigationSummary> {
  const limits = opts.limits ?? DEFAULT_INVESTIGATION_LIMITS
  const adapters = opts.adapters ?? getActiveSearchAdapters()
  const processedUrls = new Set<string>()
  let queriesGenerated = 0
  let documentsAdded = 0
  let stoppedReason: InvestigationStoppedReason = 'NO_NEW_EVIDENCE'

  let frontier = await resolveTargets(target)
  let depth = 0

  while (depth < limits.maxDepth) {
    depth++
    const newlyAffected = new Set<string>()

    for (const canonicalId of frontier) {
      const queries = await generateQueriesForCanonical(canonicalId, { max: limits.maxQueriesPerClaim })
      queriesGenerated += queries.length

      if (adapters.length === 0) {
        await prisma.investigationQuery.updateMany({
          where: { id: { in: queries.map((q) => q.id) } },
          data: { status: 'SKIPPED_NO_ADAPTER' },
        })
        continue
      }

      for (const q of queries) {
        let resultCount = 0
        for (const adapter of adapters) {
          let docs: SearchDoc[] = []
          try {
            docs = await adapter.search({ queryText: q.queryText, queryClass: q.queryClass }, { limit: limits.maxDocumentsPerQuery })
          } catch {
            // Failed adapter is recorded implicitly (no results) and never crashes the run.
            continue
          }
          for (const doc of docs.slice(0, limits.maxDocumentsPerQuery)) {
            if (processedUrls.has(doc.url)) continue
            processedUrls.add(doc.url)
            const affected = await ingest(doc)
            if (affected.length > 0) {
              documentsAdded++
              resultCount++
              affected.forEach((id) => newlyAffected.add(id))
            }
          }
        }
        await prisma.investigationQuery.update({ where: { id: q.id }, data: { status: 'COMPLETED', resultCount } })
      }
    }

    if (adapters.length === 0) {
      stoppedReason = 'NO_ADAPTER_CONFIGURED'
      break
    }
    if (newlyAffected.size === 0) {
      stoppedReason = 'NO_NEW_EVIDENCE'
      break
    }
    if (depth >= limits.maxDepth) {
      stoppedReason = 'MAX_DEPTH'
      break
    }
    frontier = [...newlyAffected]
  }

  return {
    target: { canonicalClaimId: target.canonicalClaimId, eventCandidateId: target.eventCandidateId },
    queriesGenerated,
    adaptersTried: adapters.length,
    documentsAdded,
    stoppedReason,
  }
}
