import type { AtomicClaim, ClaimLineage } from '@prisma/client'
import { prisma } from '@/server/db'
import type { RelationToOrigin } from '@/shared/enums'
import { blendedSimilarity, COPY_THRESHOLD, normalise } from './text'
import type { EvidenceError } from './types'

/** Lexical markers that a report is disputing/denying the origin claim rather
 *  than repeating or supporting it. */
const CONTRADICTION_RE =
  /\b(denie[sd]?|disput|reject|refut|no evidence|not true|false claim|contradict|no (?:job )?cuts|will not|won'?t|no plans to)\b/i

function readCommentary(json: string): boolean {
  try {
    const j = JSON.parse(json)
    return !!(j && typeof j === 'object' && (j as Record<string, unknown>).commentary)
  } catch {
    return false
  }
}

function isSupport(rel: RelationToOrigin): boolean {
  return rel === 'ORIGIN_CANDIDATE' || rel === 'INDEPENDENT_SUPPORT'
}

/** Classifies each atomic claim of a canonical claim as origin / likely-copy /
 *  independent-support / commentary / contradiction, writes ClaimLineage rows,
 *  and recomputes the canonical + cluster counts (copies excluded from the
 *  independent-source count). */
export async function traceLineage(
  canonicalClaimId: string,
): Promise<{ lineage: ClaimLineage[]; errors: EvidenceError[] }> {
  const errors: EvidenceError[] = []
  const canonical = await prisma.canonicalClaim.findUnique({ where: { id: canonicalClaimId } })
  if (!canonical) {
    return { lineage: [], errors: [{ stage: 'lineage', message: `Canonical claim ${canonicalClaimId} not found`, canonicalClaimId }] }
  }
  const atomics = await prisma.atomicClaim.findMany({ where: { canonicalClaimId } })
  if (atomics.length === 0) return { lineage: [], errors }

  const ordered = [...atomics].sort(
    (a, b) => (a.eventDate?.getTime() ?? a.createdAt.getTime()) - (b.eventDate?.getTime() ?? b.createdAt.getTime()),
  )
  const originNorm = normalise(ordered[0].claimText)
  const firstSeenAt = ordered[0].eventDate ?? ordered[0].createdAt

  const docIds = [...new Set(ordered.map((a) => a.documentId))]
  const docs = await prisma.document.findMany({ where: { id: { in: docIds } } })
  const urlByDoc = new Map(docs.map((d) => [d.id, d.url]))

  type Row = { atomic: AtomicClaim; relation: RelationToOrigin; isLikelyCopy: boolean; originConfidence: number }
  const rows: Row[] = ordered.map((atomic, i) => {
    if (i === 0) {
      return {
        atomic,
        relation: 'ORIGIN_CANDIDATE',
        isLikelyCopy: false,
        originConfidence: Math.min(1, 0.5 + 0.1 * (ordered.length - 1)),
      }
    }
    const sim = blendedSimilarity(normalise(atomic.claimText), originNorm)
    let relation: RelationToOrigin
    let isLikelyCopy = false
    if (CONTRADICTION_RE.test(atomic.claimText)) relation = 'CONTRADICTION'
    else if (sim >= COPY_THRESHOLD) {
      relation = 'LIKELY_COPY'
      isLikelyCopy = true
    } else if (readCommentary(atomic.metadataJson)) relation = 'COMMENTARY'
    else relation = 'INDEPENDENT_SUPPORT'
    return { atomic, relation, isLikelyCopy, originConfidence: 0 }
  })

  const lineage: ClaimLineage[] = []
  for (const r of rows) {
    try {
      const row = await prisma.claimLineage.upsert({
        where: { canonicalClaimId_documentId: { canonicalClaimId, documentId: r.atomic.documentId } },
        create: {
          canonicalClaimId,
          sourceId: r.atomic.sourceId,
          documentId: r.atomic.documentId,
          url: urlByDoc.get(r.atomic.documentId) ?? '',
          publishedAt: r.atomic.eventDate,
          firstSeenAt,
          relationToOrigin: r.relation,
          isLikelyCopy: r.isLikelyCopy,
          originConfidence: r.originConfidence,
        },
        update: {
          sourceId: r.atomic.sourceId,
          url: urlByDoc.get(r.atomic.documentId) ?? '',
          publishedAt: r.atomic.eventDate,
          firstSeenAt,
          relationToOrigin: r.relation,
          isLikelyCopy: r.isLikelyCopy,
          originConfidence: r.originConfidence,
        },
      })
      lineage.push(row)
    } catch (err) {
      errors.push({ stage: 'lineage', message: err instanceof Error ? err.message : String(err), canonicalClaimId })
    }
  }

  const independentSources = new Set(rows.filter((r) => isSupport(r.relation)).map((r) => r.atomic.sourceId))
  const copiedSources = new Set(rows.filter((r) => r.relation === 'LIKELY_COPY').map((r) => r.atomic.sourceId))
  const allSources = new Set(rows.map((r) => r.atomic.sourceId))
  const contradictionCount = rows.filter((r) => r.relation === 'CONTRADICTION').length
  const repeatCount = rows.length

  await prisma.canonicalClaim.update({
    where: { id: canonicalClaimId },
    data: {
      independentSourceCount: independentSources.size,
      repeatCount,
      contradictionCount,
      supportScore: Math.min(1, independentSources.size / 3),
      originCandidateUrl: urlByDoc.get(ordered[0].documentId) ?? canonical.originCandidateUrl,
    },
  })

  await prisma.claimCluster.upsert({
    where: { canonicalClaimId },
    create: {
      canonicalClaimId,
      title: canonical.claimText.slice(0, 80),
      summary: `${repeatCount} report(s) of ${canonical.claimType}`,
      sourceCount: allSources.size,
      independentSourceCount: independentSources.size,
      copiedSourceCount: copiedSources.size,
      contradictionCount,
    },
    update: {
      sourceCount: allSources.size,
      independentSourceCount: independentSources.size,
      copiedSourceCount: copiedSources.size,
      contradictionCount,
    },
  })

  return { lineage, errors }
}

export async function traceLineageForMany(
  canonicalClaimIds: string[],
): Promise<{ lineage: ClaimLineage[]; errors: EvidenceError[] }> {
  const lineage: ClaimLineage[] = []
  const errors: EvidenceError[] = []
  for (const id of canonicalClaimIds) {
    const r = await traceLineage(id)
    lineage.push(...r.lineage)
    errors.push(...r.errors)
  }
  return { lineage, errors }
}
