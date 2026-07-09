import { createHash } from 'node:crypto'
import { prisma } from '@/server/db'
import { extractAtomicClaims } from './extraction'
import { assignCanonicalClaims } from './canonical'
import { simhash64 } from './fingerprint'
import { deriveIndependenceGroup } from './independence'
import { traceLineageForMany } from './lineage'
import { scoreReliabilityForMany } from './reliability'
import { generateQueriesForCanonical } from './investigation-query'
import { getActiveProvider } from '@/server/llm/provider'
import { getActiveSearchAdapters, type SearchAdapter, type SearchDoc } from './search/registry'
import {
  DEFAULT_INVESTIGATION_LIMITS,
  type InvestigationLimits,
  type InvestigationStoppedReason,
  type InvestigationSummary,
} from './types'

export type InvestigationTarget = {
  canonicalClaimId?: string
  eventCandidateId?: string
  /** Free-text seed (the interrogate→investigate bridge): the loop first
   *  searches the term itself, ingests what it finds, then investigates the
   *  canonical claims that evidence produced. */
  queryText?: string
}
export type InvestigationRunOptions = {
  limits?: InvestigationLimits
  /** Inject adapters for tests. Defaults to the registry (env-gated). */
  adapters?: SearchAdapter[]
  /** LLM provider for query generation. Omit → getActiveProvider() (dormant
   *  unless the owner has activated AI); templates remain the fallback. */
  provider?: import('@/server/llm/types').LLMProvider | null
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
  // Group search-ingested sources by the RESULT's publisher domain, not the
  // synthetic source name — a search hit on bbc.co.uk is the same publisher
  // as the scanned BBC feed for independence-counting purposes.
  const independenceGroup = deriveIndependenceGroup(doc.url, sourceName)
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
      independenceGroup,
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
        simhash: simhash64(doc.content),
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
 *  stops with NO_ADAPTER_CONFIGURED — no external calls, no fabrication. With
 *  an adapter it ingests new evidence, re-scores, and stops on saturation /
 *  depth / runtime / cost limits — ALL limits are enforced, so a live adapter
 *  can never turn the loop into an unbounded crawler. Per-adapter failures
 *  are swallowed, never crash the run; the same document is never processed
 *  twice. */
export async function runInvestigation(
  target: InvestigationTarget,
  opts: InvestigationRunOptions = {},
): Promise<InvestigationSummary> {
  const limits = { ...DEFAULT_INVESTIGATION_LIMITS, ...opts.limits }
  // Source-type filter: when set, only adapters reaching allowed categories run.
  const allAdapters = opts.adapters ?? getActiveSearchAdapters()
  const adapters = limits.allowedSourceTypes
    ? allAdapters.filter((a) => a.sourceType && limits.allowedSourceTypes!.includes(a.sourceType))
    : allAdapters
  // LLM query generation only when a provider is active (owner decision);
  // deterministic templates otherwise.
  const provider = opts.provider === undefined ? await getActiveProvider() : opts.provider

  const startedAt = Date.now()
  const deadline = limits.maxRuntimeMs != null ? startedAt + limits.maxRuntimeMs : null
  let adapterCalls = 0
  const processedUrls = new Set<string>()
  let queriesGenerated = 0
  let documentsAdded = 0
  let stoppedReason: InvestigationStoppedReason = 'NO_NEW_EVIDENCE'
  const outOfRuntime = () => deadline !== null && Date.now() > deadline
  const outOfBudget = () => limits.maxCostBudget != null && adapterCalls >= limits.maxCostBudget

  let frontier = await resolveTargets(target)

  // Free-text seed round (interrogate → investigate): search the term itself,
  // ingest, and let the produced canonical claims form the first frontier.
  if (frontier.length === 0 && target.queryText && adapters.length > 0) {
    const seeded = new Set<string>()
    for (const adapter of adapters) {
      if (outOfRuntime() || outOfBudget()) break
      adapterCalls++
      let docs: SearchDoc[] = []
      try {
        docs = await adapter.search(
          { queryText: target.queryText, queryClass: 'AFFECTED_ENTITIES' },
          { limit: limits.maxDocumentsPerQuery },
        )
      } catch {
        continue
      }
      for (const doc of docs.slice(0, limits.maxDocumentsPerQuery)) {
        if (processedUrls.has(doc.url)) continue
        processedUrls.add(doc.url)
        const affected = await ingest(doc)
        if (affected.length > 0) {
          documentsAdded++
          affected.forEach((id) => seeded.add(id))
        }
      }
    }
    frontier = [...seeded]
  }

  let depth = 0
  outer: while (depth < limits.maxDepth) {
    depth++
    const newlyAffected = new Set<string>()

    for (const canonicalId of frontier) {
      const queries = await generateQueriesForCanonical(canonicalId, {
        max: limits.maxQueriesPerClaim,
        provider: provider ?? undefined,
      })
      queriesGenerated += queries.length

      if (adapters.length === 0) {
        await prisma.investigationQuery.updateMany({
          where: { id: { in: queries.map((q) => q.id) } },
          data: { status: 'SKIPPED_NO_ADAPTER' },
        })
        continue
      }

      for (const q of queries) {
        if (outOfRuntime() || outOfBudget()) {
          stoppedReason = 'LIMIT'
          break outer
        }
        let resultCount = 0
        for (const adapter of adapters) {
          if (outOfRuntime() || outOfBudget()) {
            stoppedReason = 'LIMIT'
            break outer
          }
          adapterCalls++
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
      stoppedReason = allAdapters.length === 0 ? 'NO_ADAPTER_CONFIGURED' : 'LIMIT'
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
    target: {
      canonicalClaimId: target.canonicalClaimId,
      eventCandidateId: target.eventCandidateId,
      queryText: target.queryText,
    },
    queriesGenerated,
    adaptersTried: adapters.length,
    documentsAdded,
    stoppedReason,
  }
}
