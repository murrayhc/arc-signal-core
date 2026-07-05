import type { Document, ParsedDocument, Source } from '@prisma/client'
import { extractAtomicClaims } from './extraction'
import { assignCanonicalClaims } from './canonical'
import { traceLineageForMany } from './lineage'
import { scoreReliabilityForMany } from './reliability'
import { generateQueriesForCanonical } from './investigation-query'
import type { EvidenceDepthCounts, EvidenceError } from './types'

/** In-scan follow-up query generation is capped to the most meaningful new
 *  canonical claims — the recursive investigation loop stays on-demand. */
const MAX_QUERY_CLAIMS_PER_SCAN = 10
const QUERIES_PER_CLAIM_IN_SCAN = 8

/** Runs the evidence-depth layer over a scan's parsed documents:
 *  atomic extraction → canonical clustering → lineage → reliability → capped
 *  in-scan follow-up query generation. Deterministic and dormant-safe. Returns
 *  counts for ScanRun; accumulates non-fatal errors rather than throwing. */
export async function runEvidenceDepth(
  parsedDocs: ParsedDocument[],
  docsById: Map<string, Document>,
  sourcesById: Map<string, Source>,
): Promise<{ counts: EvidenceDepthCounts; errors: EvidenceError[] }> {
  const errors: EvidenceError[] = []
  const counts: EvidenceDepthCounts = {
    atomicClaimsExtracted: 0,
    canonicalClaimsCreated: 0,
    canonicalClaimsUpdated: 0,
    claimClustersUpserted: 0,
    lineageRecordsCreated: 0,
    investigationQueriesGenerated: 0,
  }

  const extraction = await extractAtomicClaims(parsedDocs, docsById, sourcesById)
  errors.push(...extraction.errors)
  counts.atomicClaimsExtracted = extraction.atomicClaims.length
  if (extraction.atomicClaims.length === 0) return { counts, errors }

  const canonical = await assignCanonicalClaims(extraction.atomicClaims)
  errors.push(...canonical.errors)
  counts.canonicalClaimsCreated = canonical.created.length
  counts.canonicalClaimsUpdated = canonical.updated.length
  counts.claimClustersUpserted = canonical.affectedCanonicalIds.length

  const lineage = await traceLineageForMany(canonical.affectedCanonicalIds)
  errors.push(...lineage.errors)
  counts.lineageRecordsCreated = lineage.lineage.length

  const reliability = await scoreReliabilityForMany(canonical.affectedCanonicalIds)
  errors.push(...reliability.errors)

  for (const c of canonical.created.slice(0, MAX_QUERY_CLAIMS_PER_SCAN)) {
    try {
      const queries = await generateQueriesForCanonical(c.id, { max: QUERIES_PER_CLAIM_IN_SCAN })
      counts.investigationQueriesGenerated += queries.length
    } catch (err) {
      errors.push({ stage: 'investigation-query', message: err instanceof Error ? err.message : String(err), canonicalClaimId: c.id })
    }
  }

  return { counts, errors }
}
