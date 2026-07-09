import type { AtomicClaim, ClaimLineage } from '@prisma/client'
import { prisma } from '@/server/db'
import type { RelationToOrigin } from '@/shared/enums'
import { isNearDuplicate } from './fingerprint'
import { blendedSimilarity, COPY_THRESHOLD, normalise } from './text'
import type { EvidenceError } from './types'

/** Copies landing within this window of the origin count toward the
 *  copy-burst (coordinated-amplification) signal. */
const BURST_WINDOW_MS = 48 * 60 * 60 * 1000

/** Per-relation confidence that a row is itself the true origin. The origin
 *  candidate's own confidence grows with corroboration (set separately); a
 *  near-verbatim copy is almost certainly downstream of the origin; an
 *  independently-worded report could plausibly be an undetected origin. */
const ORIGIN_CONFIDENCE_BY_RELATION: Record<string, number> = {
  LIKELY_COPY: 0.05,
  INDEPENDENT_SUPPORT: 0.3,
  COMMENTARY: 0.1,
  CONTRADICTION: 0.05,
}

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
  const simhashByDoc = new Map(docs.map((d) => [d.id, d.simhash]))
  // Normalised full-document text, for the length-robust copy check: simhash
  // distance scales with edit FRACTION, so on short documents (RSS blurbs)
  // even light rewording moves the hash too far — the token/trigram blend on
  // the whole body catches those. Computed lazily, origin-vs-row only (a
  // cluster is small, so this stays O(cluster size), never O(n²)).
  const normalisedDocText = new Map<string, ReturnType<typeof normalise>>()
  const docTextOf = (docId: string) => {
    let cached = normalisedDocText.get(docId)
    if (!cached) {
      const raw = docs.find((d) => d.id === docId)?.rawContent ?? ''
      cached = normalise(raw)
      normalisedDocText.set(docId, cached)
    }
    return cached
  }

  // Publisher independence groups: sources in one group are one voice.
  const lineageSourceIds = [...new Set(ordered.map((a) => a.sourceId))]
  const lineageSources = await prisma.source.findMany({
    where: { id: { in: lineageSourceIds } },
    select: { id: true, independenceGroup: true },
  })
  const groupBySource = new Map(lineageSources.map((s) => [s.id, s.independenceGroup ?? s.id]))
  const groupOf = (sourceId: string) => groupBySource.get(sourceId) ?? sourceId

  const originSimhash = simhashByDoc.get(ordered[0].documentId)

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
    // Three copy signals, any of which is sufficient: near-verbatim CLAIM
    // wording (Jaccard blend on the extracted sentence); near-identical
    // DOCUMENT fingerprint (simhash — cheap, catches long-article
    // syndication); or high whole-DOCUMENT text similarity (length-robust,
    // catches short-doc syndication where the fingerprint is noisy).
    const documentIsNearDuplicate =
      atomic.documentId !== ordered[0].documentId &&
      (isNearDuplicate(originSimhash, simhashByDoc.get(atomic.documentId)) ||
        blendedSimilarity(docTextOf(atomic.documentId), docTextOf(ordered[0].documentId)) >= COPY_THRESHOLD)
    let relation: RelationToOrigin
    let isLikelyCopy = false
    if (CONTRADICTION_RE.test(atomic.claimText)) relation = 'CONTRADICTION'
    else if (sim >= COPY_THRESHOLD || documentIsNearDuplicate) {
      relation = 'LIKELY_COPY'
      isLikelyCopy = true
    } else if (readCommentary(atomic.metadataJson)) relation = 'COMMENTARY'
    else relation = 'INDEPENDENT_SUPPORT'
    return { atomic, relation, isLikelyCopy, originConfidence: ORIGIN_CONFIDENCE_BY_RELATION[relation] ?? 0 }
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

  // Independence is counted in publisher GROUPS, not source rows: five feeds
  // owned by one publisher are one independent voice. Copies never count.
  const independentGroups = new Set(rows.filter((r) => isSupport(r.relation)).map((r) => groupOf(r.atomic.sourceId)))
  const copiedSources = new Set(rows.filter((r) => r.relation === 'LIKELY_COPY').map((r) => r.atomic.sourceId))
  const allSources = new Set(rows.map((r) => r.atomic.sourceId))
  const contradictionCount = rows.filter((r) => r.relation === 'CONTRADICTION').length
  const repeatCount = rows.length

  // Copy-burst manipulation signal: a claim whose copies mostly land inside a
  // tight window after the origin looks amplified, not corroborated. Requires
  // >=2 copies — one syndicated pickup is normal news flow, not a campaign.
  const copies = rows.filter((r) => r.relation === 'LIKELY_COPY')
  const originTime = firstSeenAt.getTime()
  const burstCopies = copies.filter((r) => {
    const t = (r.atomic.eventDate ?? r.atomic.createdAt).getTime()
    return t - originTime <= BURST_WINDOW_MS
  })
  const manipulationRiskScore =
    copies.length >= 2
      ? Math.min(1, 0.6 * (burstCopies.length / rows.length) + 0.4 * (copies.length / rows.length))
      : 0

  await prisma.canonicalClaim.update({
    where: { id: canonicalClaimId },
    data: {
      independentSourceCount: independentGroups.size,
      repeatCount,
      contradictionCount,
      supportScore: Math.min(1, independentGroups.size / 3),
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
      independentSourceCount: independentGroups.size,
      copiedSourceCount: copiedSources.size,
      contradictionCount,
      manipulationRiskScore,
    },
    update: {
      sourceCount: allSources.size,
      independentSourceCount: independentGroups.size,
      copiedSourceCount: copiedSources.size,
      contradictionCount,
      manipulationRiskScore,
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
