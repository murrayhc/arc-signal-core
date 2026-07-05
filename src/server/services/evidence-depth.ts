import { prisma } from '@/server/db'
import type { FactualityLabel } from '@/shared/enums'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'

export type LineageView = {
  sourceId: string
  url: string
  relationToOrigin: string
  isLikelyCopy: boolean
  publishedAt: string | null
  originConfidence: number
}

export type ClaimDepth = {
  id: string
  claimText: string
  claimType: string
  reliabilityScore: number
  factualityLabel: FactualityLabel
  independentSourceCount: number
  repeatCount: number
  contradictionCount: number
  copiedSourceCount: number
  originCandidateUrl: string | null
  atomicCount: number
  lineage: LineageView[]
}

export type AtomicFact = {
  id: string
  claimText: string
  claimType: string
  factualityLabel: FactualityLabel
  specificityScore: number
}

export type QueryView = { queryText: string; queryClass: string; status: string }

export type EventEvidenceDepth =
  | { hasDepth: false }
  | {
      hasDepth: true
      claims: ClaimDepth[]
      atomicFacts: AtomicFact[]
      supportingCount: number
      contradictingCount: number
      queries: QueryView[]
      gaps: string[]
    }

const SUPPORT_RELATIONS = new Set(['ORIGIN_CANDIDATE', 'INDEPENDENT_SUPPORT'])

export async function getEventEvidenceDepth(eventCandidateId: string): Promise<EventEvidenceDepth> {
  const canonicalIds = await canonicalIdsForEvent(eventCandidateId)
  if (canonicalIds.length === 0) return { hasDepth: false }

  const [canonicals, clusters, atomics, lineage, queries] = await Promise.all([
    prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } }),
    prisma.claimCluster.findMany({ where: { canonicalClaimId: { in: canonicalIds } } }),
    prisma.atomicClaim.findMany({ where: { canonicalClaimId: { in: canonicalIds } } }),
    prisma.claimLineage.findMany({ where: { canonicalClaimId: { in: canonicalIds } } }),
    prisma.investigationQuery.findMany({ where: { canonicalClaimId: { in: canonicalIds } } }),
  ])

  const clusterByCanonical = new Map(clusters.map((c) => [c.canonicalClaimId, c]))
  const labelByCanonical = new Map<string, FactualityLabel>()
  const atomicCountByCanonical = new Map<string, number>()
  for (const a of atomics) {
    if (!a.canonicalClaimId) continue
    if (!labelByCanonical.has(a.canonicalClaimId)) labelByCanonical.set(a.canonicalClaimId, a.factualityLabel as FactualityLabel)
    atomicCountByCanonical.set(a.canonicalClaimId, (atomicCountByCanonical.get(a.canonicalClaimId) ?? 0) + 1)
  }
  const lineageByCanonical = new Map<string, typeof lineage>()
  for (const l of lineage) {
    const arr = lineageByCanonical.get(l.canonicalClaimId) ?? []
    arr.push(l)
    lineageByCanonical.set(l.canonicalClaimId, arr)
  }

  const claims: ClaimDepth[] = canonicals.map((c) => {
    const cluster = clusterByCanonical.get(c.id)
    return {
      id: c.id,
      claimText: c.claimText,
      claimType: c.claimType,
      reliabilityScore: c.reliabilityScore,
      factualityLabel: labelByCanonical.get(c.id) ?? 'UNVERIFIED',
      independentSourceCount: c.independentSourceCount,
      repeatCount: c.repeatCount,
      contradictionCount: c.contradictionCount,
      copiedSourceCount: cluster?.copiedSourceCount ?? 0,
      originCandidateUrl: c.originCandidateUrl,
      atomicCount: atomicCountByCanonical.get(c.id) ?? 0,
      lineage: (lineageByCanonical.get(c.id) ?? []).map((l) => ({
        sourceId: l.sourceId,
        url: l.url,
        relationToOrigin: l.relationToOrigin,
        isLikelyCopy: l.isLikelyCopy,
        publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null,
        originConfidence: l.originConfidence,
      })),
    }
  })

  const supportingCount = lineage.filter((l) => SUPPORT_RELATIONS.has(l.relationToOrigin)).length
  const contradictingCount = lineage.filter((l) => l.relationToOrigin === 'CONTRADICTION').length

  const atomicFacts: AtomicFact[] = atomics.map((a) => ({
    id: a.id,
    claimText: a.claimText,
    claimType: a.claimType,
    factualityLabel: a.factualityLabel as FactualityLabel,
    specificityScore: a.specificityScore,
  }))

  const gaps: string[] = []
  for (const c of canonicals) {
    const short = c.claimText.length > 90 ? `${c.claimText.slice(0, 90)}…` : c.claimText
    const cluster = clusterByCanonical.get(c.id)
    if (c.contradictionCount > 0) gaps.push(`Disputed claim: "${short}"`)
    if ((cluster?.copiedSourceCount ?? 0) >= 2 && c.independentSourceCount <= 1) {
      gaps.push(`Widely copied but thinly sourced: "${short}"`)
    } else if (c.independentSourceCount <= 1) {
      gaps.push(`Single independent source for: "${short}"`)
    }
  }

  return {
    hasDepth: true,
    claims,
    atomicFacts,
    supportingCount,
    contradictingCount,
    queries: queries.map((q) => ({ queryText: q.queryText, queryClass: q.queryClass, status: q.status })),
    gaps,
  }
}

export async function getClaimLineage(canonicalClaimId: string) {
  const canonical = await prisma.canonicalClaim.findUnique({ where: { id: canonicalClaimId } })
  if (!canonical) return null
  const lineage = await prisma.claimLineage.findMany({
    where: { canonicalClaimId },
    orderBy: { publishedAt: 'asc' },
  })
  return {
    canonicalClaimId,
    claimText: canonical.claimText,
    claimType: canonical.claimType,
    firstSeenAt: canonical.firstSeenAt ? canonical.firstSeenAt.toISOString() : null,
    originCandidateUrl: canonical.originCandidateUrl,
    lineage: lineage.map((l) => ({
      sourceId: l.sourceId,
      documentId: l.documentId,
      url: l.url,
      relationToOrigin: l.relationToOrigin,
      isLikelyCopy: l.isLikelyCopy,
      originConfidence: l.originConfidence,
      publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null,
    })),
  }
}

export async function getClaimReliability(canonicalClaimId: string) {
  const canonical = await prisma.canonicalClaim.findUnique({ where: { id: canonicalClaimId } })
  if (!canonical) return null
  const cluster = await prisma.claimCluster.findUnique({ where: { canonicalClaimId } })
  const anyAtomic = await prisma.atomicClaim.findFirst({ where: { canonicalClaimId } })
  const factualityLabel = (anyAtomic?.factualityLabel as FactualityLabel) ?? 'UNVERIFIED'
  const copiedSourceCount = cluster?.copiedSourceCount ?? 0
  const reasoningSummary =
    `Reliability ${canonical.reliabilityScore.toFixed(2)} (${factualityLabel}): ` +
    `${canonical.independentSourceCount} independent source(s)` +
    (copiedSourceCount > 0 ? `, ${copiedSourceCount} likely copy(ies) ignored` : '') +
    (canonical.contradictionCount > 0 ? `, ${canonical.contradictionCount} contradiction(s)` : '') +
    '.'
  return {
    canonicalClaimId,
    claimText: canonical.claimText,
    reliabilityScore: canonical.reliabilityScore,
    factualityLabel,
    independentSourceCount: canonical.independentSourceCount,
    repeatCount: canonical.repeatCount,
    contradictionCount: canonical.contradictionCount,
    copiedSourceCount,
    reasoningSummary,
  }
}
