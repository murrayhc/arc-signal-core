import type { OutcomePrediction } from '@prisma/client'
import { prisma } from '@/server/db'
import { deriveAuthority } from '@/server/evidence/authority'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { PRIMARY_AUTHORITY_AT } from './constants'
import { utcDay } from './ledger'
import type { PredictionBaseline } from './types'

/** What changed since the prediction froze — the deterministic observables the
 *  resolution rules and the path classifier decide from. Everything is a diff
 *  against the frozen baselineJson, so re-scans of unchanged evidence are a
 *  no-op regardless of timestamps. */
export type EvidenceDelta = {
  newSupportGroups: string[]
  newSupportDays: number
  primaryCorroboration: boolean
  newContradictions: number
  anyCanonicalContradicted: boolean
  minReliability: number
  newEntityCount: number
  newEvidenceIds: string[]
}

function parseBaseline(json: string): PredictionBaseline {
  try {
    const b = JSON.parse(json)
    return {
      groups: Array.isArray(b?.groups) ? b.groups : [],
      entityIds: Array.isArray(b?.entityIds) ? b.entityIds : [],
      contradictionCount: typeof b?.contradictionCount === 'number' ? b.contradictionCount : 0,
      supportDays: Array.isArray(b?.supportDays) ? b.supportDays : [],
    }
  } catch {
    return { groups: [], entityIds: [], contradictionCount: 0, supportDays: [] }
  }
}

export async function computeEvidenceDelta(prediction: OutcomePrediction): Promise<EvidenceDelta> {
  const baseline = parseBaseline(prediction.baselineJson)
  const canonicalIds = await canonicalIdsForEvent(prediction.eventCandidateId)

  const lineage = canonicalIds.length
    ? await prisma.claimLineage.findMany({ where: { canonicalClaimId: { in: canonicalIds } } })
    : []
  const sourceIds = [...new Set(lineage.map((l) => l.sourceId))]
  const sources = sourceIds.length ? await prisma.source.findMany({ where: { id: { in: sourceIds } } }) : []
  const groupOf = new Map(sources.map((s) => [s.id, s.independenceGroup ?? s.id]))
  const categoryOf = new Map(sources.map((s) => [s.id, s.category]))

  const support = lineage.filter(
    (l) => l.relationToOrigin === 'ORIGIN_CANDIDATE' || l.relationToOrigin === 'INDEPENDENT_SUPPORT',
  )
  const baselineGroups = new Set(baseline.groups)
  const newSupport = support.filter((l) => !baselineGroups.has(groupOf.get(l.sourceId) ?? l.sourceId))
  const newSupportGroups = [...new Set(newSupport.map((l) => groupOf.get(l.sourceId) ?? l.sourceId))]

  const baselineDays = new Set(baseline.supportDays)
  const newSupportDays = new Set(
    newSupport.map((l) => utcDay(l.publishedAt ?? l.createdAt)).filter((d) => !baselineDays.has(d)),
  ).size

  const primaryCorroboration = newSupport.some(
    (l) => deriveAuthority(categoryOf.get(l.sourceId) ?? 'UNKNOWN') >= PRIMARY_AUTHORITY_AT,
  )

  const canonicals = canonicalIds.length
    ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } })
    : []
  const contradictionCount = canonicals.reduce((n, c) => n + c.contradictionCount, 0)
  const newContradictions = Math.max(0, contradictionCount - baseline.contradictionCount)
  const anyCanonicalContradicted = canonicals.some((c) => c.factualityLabel === 'CONTRADICTED')
  const minReliability = canonicals.length ? Math.min(...canonicals.map((c) => c.reliabilityScore)) : 1

  const baselineEntities = new Set(baseline.entityIds)
  const entities = await prisma.eventCandidateEntity.findMany({
    where: { eventCandidateId: prediction.eventCandidateId },
  })
  const newEntityCount = entities.filter((e) => !baselineEntities.has(e.entityId)).length

  const contradictionRows = lineage.filter((l) => l.relationToOrigin === 'CONTRADICTION')
  const newEvidenceIds = [...new Set([...newSupport, ...contradictionRows].map((l) => l.documentId))].slice(0, 20)

  return {
    newSupportGroups,
    newSupportDays,
    primaryCorroboration,
    newContradictions,
    anyCanonicalContradicted,
    minReliability,
    newEntityCount,
    newEvidenceIds,
  }
}
