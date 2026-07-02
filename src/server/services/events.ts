import { prisma } from '@/server/db'

export type EvidenceItem = {
  claimId: string; claimText: string; claimType: string; confidence: number; needsReview: boolean
  date: string | null; direction: string; documentTitle: string; documentUrl: string
  sourceName: string; isFixture: boolean
}

export type EventDetail = {
  event: {
    id: string; title: string; eventType: string; eventClass: string; status: string; summary: string
    severity: number; probability: number; confidence: number; riskScore: number; opportunityScore: number
    noveltyScore: number; evidenceCount: number; sourceDiversityScore: number
    affectedSector: string | null; affectedRegion: string | null
    firstDetectedAt: string; lastUpdatedAt: string
    timeWindowStart: string | null; timeWindowEnd: string | null
    isFixture: boolean; primaryEntity: { id: string; name: string } | null
  }
  riskOpportunities: { type: string; title: string; explanation: string; riskLogic: string; opportunityLogic: string; confidence: number }[]
  suggestedQuestions: string[]
  clusters: { id: string; title: string; explanation: string; strength: number; confidence: number; novelty: number }[]
  evidence: EvidenceItem[]
  evidenceAgainst: EvidenceItem[]
  dataGaps: { title: string; description: string; impactOnConfidence: number; suggestedSourceCategory: string; severity: string }[]
  triggerConditions: { signalType: string; conditionText: string; direction: 'RAISES' | 'LOWERS'; probabilityImpact: number; priority: number }[]
  relatedEntities: { id: string; name: string }[]
}

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const event = await prisma.eventCandidate.findUnique({
    where: { id },
    include: {
      primaryEntity: true,
      riskOpportunities: true,
      dataGaps: true,
      triggerConditions: { orderBy: { priority: 'asc' } },
      entities: { include: { entity: true } },
      clusters: {
        include: {
          signals: {
            include: {
              signal: {
                include: { claim: true, document: { include: { source: true } } },
              },
            },
          },
        },
      },
    },
  })
  if (!event) return null

  const evidence: EvidenceItem[] = event.clusters
    .flatMap((c) => c.signals.map((link) => link.signal))
    .map((s) => ({
      claimId: s.claim.id,
      claimText: s.claim.claimText,
      claimType: s.claim.claimType,
      confidence: s.claim.extractionConfidence,
      needsReview: s.claim.needsReview,
      date: (s.claim.claimDate ?? s.document.publishedAt)?.toISOString() ?? null,
      direction: s.direction,
      documentTitle: s.document.title,
      documentUrl: s.document.url,
      sourceName: s.document.source.name,
      isFixture: s.isFixture,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const opposing =
    event.eventClass === 'RISK' ? 'POSITIVE' : event.eventClass === 'OPPORTUNITY' ? 'NEGATIVE' : null
  const evidenceAgainst = opposing ? evidence.filter((e) => e.direction === opposing) : []

  const suggestedQuestions = [
    ...new Set(event.riskOpportunities.flatMap((ro) => JSON.parse(ro.questionsJson) as string[])),
  ]

  return {
    event: {
      id: event.id,
      title: event.title,
      eventType: event.eventType,
      eventClass: event.eventClass,
      status: event.status,
      summary: event.summary,
      severity: event.severity,
      probability: event.probability,
      confidence: event.confidence,
      riskScore: event.riskScore,
      opportunityScore: event.opportunityScore,
      noveltyScore: event.noveltyScore,
      evidenceCount: event.evidenceCount,
      sourceDiversityScore: event.sourceDiversityScore,
      affectedSector: event.affectedSector,
      affectedRegion: event.affectedRegion,
      firstDetectedAt: event.firstDetectedAt.toISOString(),
      lastUpdatedAt: event.lastUpdatedAt.toISOString(),
      timeWindowStart: event.timeWindowStart?.toISOString() ?? null,
      timeWindowEnd: event.timeWindowEnd?.toISOString() ?? null,
      isFixture: event.isFixture,
      primaryEntity: event.primaryEntity ? { id: event.primaryEntity.id, name: event.primaryEntity.name } : null,
    },
    riskOpportunities: event.riskOpportunities.map((ro) => ({
      type: ro.type,
      title: ro.title,
      explanation: ro.explanation,
      riskLogic: ro.riskLogic,
      opportunityLogic: ro.opportunityLogic,
      confidence: ro.confidence,
    })),
    suggestedQuestions,
    clusters: event.clusters.map((c) => ({
      id: c.id,
      title: c.title,
      explanation: c.explanation,
      strength: c.strength,
      confidence: c.confidence,
      novelty: c.novelty,
    })),
    evidence,
    evidenceAgainst,
    dataGaps: event.dataGaps.map((g) => ({
      title: g.title,
      description: g.description,
      impactOnConfidence: g.impactOnConfidence,
      suggestedSourceCategory: g.suggestedSourceCategory,
      severity: g.severity,
    })),
    triggerConditions: event.triggerConditions.map((t) => ({
      signalType: t.signalType,
      conditionText: t.conditionText,
      direction: t.direction as 'RAISES' | 'LOWERS',
      probabilityImpact: t.probabilityImpact,
      priority: t.priority,
    })),
    relatedEntities: event.entities.map((link) => ({ id: link.entity.id, name: link.entity.name })),
  }
}

export type EventAction = 'ESCALATE' | 'DISMISS' | 'NEEDS_REVIEW'

const ACTION_TO_STATUS: Record<EventAction, string> = {
  ESCALATE: 'ESCALATED',
  DISMISS: 'DISMISSED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
}

export async function updateEventStatus(
  id: string,
  action: EventAction,
): Promise<{ id: string; status: string } | null> {
  const event = await prisma.eventCandidate.findUnique({ where: { id } })
  if (!event) return null
  const status = ACTION_TO_STATUS[action]
  await prisma.$transaction([
    prisma.eventCandidate.update({ where: { id }, data: { status } }),
    prisma.dashboardFeedItem.updateMany({ where: { eventCandidateId: id }, data: { status } }),
  ])
  return { id, status }
}
