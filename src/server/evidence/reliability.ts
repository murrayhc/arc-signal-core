import type { AtomicClaim, ClaimLineage, Source } from '@prisma/client'
import { prisma } from '@/server/db'
import type { FactualityLabel } from '@/shared/enums'
import { deriveAuthority } from './authority'
import type { EvidenceError, ReliabilityDimensions, ReliabilityResult } from './types'

const WEIGHTS = { authority: 0.28, independence: 0.3, support: 0.12, specificity: 0.15, freshness: 0.15 }
const FRESHNESS_HORIZON_DAYS = 180
const STALE_BELOW = 0.25
const PRIMARY_AUTHORITY = 0.85
const CONTRADICTED_AT = 0.4

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function isSupport(rel: string): boolean {
  return rel === 'ORIGIN_CANDIDATE' || rel === 'INDEPENDENT_SUPPORT'
}

function deriveFactuality(input: {
  contradictionDim: number
  recycled: boolean
  stale: boolean
  independentSourceCount: number
  primaryOrOfficial: boolean
}): FactualityLabel {
  if (input.contradictionDim >= CONTRADICTED_AT) return 'CONTRADICTED'
  if (input.recycled) return 'RECYCLED'
  if (input.stale) return 'STALE'
  if (input.independentSourceCount >= 3 || (input.independentSourceCount >= 2 && input.primaryOrOfficial)) {
    return 'STRONGLY_SUPPORTED'
  }
  if (input.independentSourceCount >= 2 || input.primaryOrOfficial) return 'SUPPORTED'
  if (input.independentSourceCount <= 1) return 'WEAK_SINGLE_SOURCE'
  return 'UNVERIFIED'
}

export type ReliabilityOptions = { now?: Date }

/** Scores a canonical claim's reliability from its lineage. Independent
 *  primary/official sources raise the score; wide copying and contradictions
 *  lower it (as multiplicative penalties, so copies can never inflate
 *  confidence). Writes the score + factuality label onto the canonical claim
 *  and its cluster, and returns an explained result. */
export async function scoreReliability(
  canonicalClaimId: string,
  opts: ReliabilityOptions = {},
): Promise<{ result: ReliabilityResult; errors: EvidenceError[] }> {
  const errors: EvidenceError[] = []
  const now = opts.now ?? new Date()
  const canonical = await prisma.canonicalClaim.findUnique({ where: { id: canonicalClaimId } })
  if (!canonical) {
    throw new Error(`Canonical claim ${canonicalClaimId} not found`)
  }
  const lineage = await prisma.claimLineage.findMany({ where: { canonicalClaimId } })
  const atomics = await prisma.atomicClaim.findMany({ where: { canonicalClaimId } })

  const sourceIds = [...new Set(lineage.map((l) => l.sourceId))]
  const sources = await prisma.source.findMany({ where: { id: { in: sourceIds } } })
  const authorityBySource = new Map<string, number>(
    sources.map((s: Source) => [s.id, deriveAuthority(s.category, s.accessMethod)]),
  )
  const authorityOf = (sid: string) => authorityBySource.get(sid) ?? deriveAuthority('UNKNOWN')

  const supportRows = lineage.filter((l) => isSupport(l.relationToOrigin))
  const copyRows = lineage.filter((l) => l.relationToOrigin === 'LIKELY_COPY')
  const contradictionRows = lineage.filter((l) => l.relationToOrigin === 'CONTRADICTION')

  const independentSources = new Set(supportRows.map((l) => l.sourceId))
  const copiedSources = new Set(copyRows.map((l) => l.sourceId))
  const allSources = new Set(lineage.map((l) => l.sourceId))
  const independentSourceCount = independentSources.size
  const contradictionCount = contradictionRows.length

  const authority = supportRows.length > 0 ? Math.max(...supportRows.map((l) => authorityOf(l.sourceId))) : deriveAuthority('UNKNOWN')
  const primaryOrOfficial = authority >= PRIMARY_AUTHORITY

  const freshness = computeFreshness(supportRows, atomics, now)
  const specificity = computeSpecificity(supportRows, atomics)
  const independence = 1 - Math.pow(0.5, independentSourceCount)
  const support = Math.min(1, independentSourceCount / 3)
  const contradictionDim = contradictionCount === 0 ? 0 : contradictionCount / (independentSourceCount + contradictionCount)
  const copyLoopRisk = allSources.size === 0 ? 0 : copiedSources.size / allSources.size

  const positive =
    WEIGHTS.authority * authority +
    WEIGHTS.independence * independence +
    WEIGHTS.support * support +
    WEIGHTS.specificity * specificity +
    WEIGHTS.freshness * freshness
  const reliabilityScore = clamp01(positive * (1 - 0.5 * contradictionDim) * (1 - 0.4 * copyLoopRisk))

  const recycled = copiedSources.size >= 2 && independentSourceCount <= 1
  const stale = freshness < STALE_BELOW
  const factualityLabel = deriveFactuality({ contradictionDim, recycled, stale, independentSourceCount, primaryOrOfficial })

  const dimensions: ReliabilityDimensions = {
    authority,
    freshness,
    specificity,
    independence,
    support,
    contradiction: contradictionDim,
    copyLoopRisk,
  }
  const { reasoningSummary, evidenceFor, evidenceAgainst, warnings } = explain({
    reliabilityScore,
    factualityLabel,
    independentSourceCount,
    copiedCount: copiedSources.size,
    contradictionCount,
    authority,
    freshness,
  })

  await prisma.canonicalClaim.update({
    where: { id: canonicalClaimId },
    data: { reliabilityScore, status: canonical.status },
  })
  await prisma.claimCluster.updateMany({ where: { canonicalClaimId }, data: { reliabilityScore } })
  await prisma.atomicClaim.updateMany({ where: { canonicalClaimId }, data: { factualityLabel } })

  const result: ReliabilityResult = {
    reliabilityScore,
    factualityLabel,
    dimensions,
    reasoningSummary,
    evidenceFor,
    evidenceAgainst,
    warnings,
  }
  return { result, errors }
}

export async function scoreReliabilityForMany(
  canonicalClaimIds: string[],
  opts: ReliabilityOptions = {},
): Promise<{ results: Record<string, ReliabilityResult>; errors: EvidenceError[] }> {
  const results: Record<string, ReliabilityResult> = {}
  const errors: EvidenceError[] = []
  for (const id of canonicalClaimIds) {
    try {
      const { result, errors: e } = await scoreReliability(id, opts)
      results[id] = result
      errors.push(...e)
    } catch (err) {
      errors.push({ stage: 'reliability', message: err instanceof Error ? err.message : String(err), canonicalClaimId: id })
    }
  }
  return { results, errors }
}

function computeFreshness(supportRows: ClaimLineage[], atomics: AtomicClaim[], now: Date): number {
  const dates = supportRows
    .map((l) => l.publishedAt)
    .filter((d): d is Date => d instanceof Date)
  const newest = dates.length > 0 ? Math.max(...dates.map((d) => d.getTime())) : null
  if (newest === null) return 0.5
  const days = (now.getTime() - newest) / (1000 * 60 * 60 * 24)
  return clamp01(1 - days / FRESHNESS_HORIZON_DAYS)
}

function computeSpecificity(supportRows: ClaimLineage[], atomics: AtomicClaim[]): number {
  const supportDocs = new Set(supportRows.map((l) => l.documentId))
  const relevant = atomics.filter((a) => supportDocs.has(a.documentId))
  const pool = relevant.length > 0 ? relevant : atomics
  if (pool.length === 0) return 0.3
  return clamp01(pool.reduce((s, a) => s + a.specificityScore, 0) / pool.length)
}

function explain(input: {
  reliabilityScore: number
  factualityLabel: FactualityLabel
  independentSourceCount: number
  copiedCount: number
  contradictionCount: number
  authority: number
  freshness: number
}): { reasoningSummary: string; evidenceFor: string[]; evidenceAgainst: string[]; warnings: string[] } {
  const evidenceFor: string[] = []
  const evidenceAgainst: string[] = []
  const warnings: string[] = []

  evidenceFor.push(`${input.independentSourceCount} independent source(s)`)
  evidenceFor.push(`strongest source authority ${input.authority.toFixed(2)}`)
  evidenceFor.push(`freshness ${input.freshness.toFixed(2)}`)
  if (input.copiedCount > 0) {
    warnings.push(`${input.copiedCount} report(s) look like copies and do not add corroboration`)
  }
  if (input.contradictionCount > 0) {
    evidenceAgainst.push(`${input.contradictionCount} contradicting report(s)`)
  }
  if (input.independentSourceCount <= 1) warnings.push('single independent source')

  const reasoningSummary =
    `Reliability ${input.reliabilityScore.toFixed(2)} (${input.factualityLabel}): ` +
    `${input.independentSourceCount} independent source(s), strongest authority ${input.authority.toFixed(2)}` +
    (input.copiedCount > 0 ? `, ${input.copiedCount} likely copy(ies) ignored` : '') +
    (input.contradictionCount > 0 ? `, ${input.contradictionCount} contradiction(s)` : '') +
    '.'

  return { reasoningSummary, evidenceFor, evidenceAgainst, warnings }
}
