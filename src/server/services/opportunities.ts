import { prisma } from '@/server/db'

function parseJson(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export type OpportunityCardData = {
  id: string; eventId: string; title: string; opportunityType: string; summary: string
  buyerPain: string; likelyBuyers: string[]; suggestedOffer: string
  affectedSectors: string[]; affectedRegions: string[]
  urgencyScore: number; commercialValueScore: number; confidence: number
  evidenceScore: number; actionabilityScore: number
  nextBestAction: string; status: string; isFixture: boolean; updatedAt: string
}

export type PositioningExampleData = {
  id: string; userType: string; title: string; positioningAngle: string
  howItCouldBeUsed: string; whyItMayMatter: string; evidenceSummary: string
  confidence: number; constraints: string; isFixture: boolean
}

export type OpportunityDetail = {
  card: OpportunityCardData & { opportunityLogic: string; riskLogic: string }
  event: { id: string; title: string; eventType: string; affectedSector: string | null; affectedRegion: string | null; confidence: number }
  positioning: PositioningExampleData[]
}

type OpportunityCardRow = {
  id: string; eventCandidateId: string; title: string; opportunityType: string; summary: string
  buyerPain: string; likelyBuyersJson: string; suggestedOffer: string
  affectedSectorsJson: string; affectedRegionsJson: string
  urgencyScore: number; commercialValueScore: number; confidence: number
  evidenceScore: number; actionabilityScore: number
  nextBestAction: string; status: string; isFixture: boolean; updatedAt: Date
}

function toCardData(card: OpportunityCardRow): OpportunityCardData {
  return {
    id: card.id,
    eventId: card.eventCandidateId,
    title: card.title,
    opportunityType: card.opportunityType,
    summary: card.summary,
    buyerPain: card.buyerPain,
    likelyBuyers: parseJson(card.likelyBuyersJson),
    suggestedOffer: card.suggestedOffer,
    affectedSectors: parseJson(card.affectedSectorsJson),
    affectedRegions: parseJson(card.affectedRegionsJson),
    urgencyScore: card.urgencyScore,
    commercialValueScore: card.commercialValueScore,
    confidence: card.confidence,
    evidenceScore: card.evidenceScore,
    actionabilityScore: card.actionabilityScore,
    nextBestAction: card.nextBestAction,
    status: card.status,
    isFixture: card.isFixture,
    updatedAt: card.updatedAt.toISOString(),
  }
}

export async function getOpportunityRadar(): Promise<OpportunityCardData[]> {
  const cards = await prisma.opportunityCard.findMany({
    where: { status: { not: 'DISMISSED' } },
    orderBy: [{ commercialValueScore: 'desc' }, { updatedAt: 'desc' }],
    take: 24,
  })
  return cards.map(toCardData)
}

export async function getOpportunitiesForEvent(eventId: string): Promise<OpportunityCardData[]> {
  const cards = await prisma.opportunityCard.findMany({
    where: { eventCandidateId: eventId },
    orderBy: [{ commercialValueScore: 'desc' }, { updatedAt: 'desc' }],
  })
  return cards.map(toCardData)
}

export async function getOpportunityDetail(id: string): Promise<OpportunityDetail | null> {
  const card = await prisma.opportunityCard.findUnique({
    where: { id },
    include: {
      eventCandidate: true,
      positioningExamples: true,
    },
  })
  if (!card) return null

  return {
    card: {
      ...toCardData(card),
      opportunityLogic: card.opportunityLogic,
      riskLogic: card.riskLogic,
    },
    event: {
      id: card.eventCandidate.id,
      title: card.eventCandidate.title,
      eventType: card.eventCandidate.eventType,
      affectedSector: card.eventCandidate.affectedSector,
      affectedRegion: card.eventCandidate.affectedRegion,
      confidence: card.eventCandidate.confidence,
    },
    positioning: card.positioningExamples.map((p) => ({
      id: p.id,
      userType: p.userType,
      title: p.title,
      positioningAngle: p.positioningAngle,
      howItCouldBeUsed: p.howItCouldBeUsed,
      whyItMayMatter: p.whyItMayMatter,
      evidenceSummary: p.evidenceSummary,
      confidence: p.confidence,
      constraints: p.constraints,
      isFixture: p.isFixture,
    })),
  }
}

export type OpportunityAction = 'ESCALATE' | 'DISMISS' | 'ACTION'

const ACTION_TO_STATUS: Record<OpportunityAction, string> = {
  ESCALATE: 'ESCALATED',
  DISMISS: 'DISMISSED',
  ACTION: 'ACTIONED',
}

export async function updateOpportunityStatus(
  id: string,
  action: OpportunityAction,
): Promise<{ id: string; status: string } | null> {
  const card = await prisma.opportunityCard.findUnique({ where: { id } })
  if (!card) return null
  const status = ACTION_TO_STATUS[action]
  await prisma.opportunityCard.update({ where: { id }, data: { status } })
  return { id, status }
}

export async function getRevenueLenses(): Promise<{ id: string; name: string; userType: string; isDefault: boolean; active: boolean }[]> {
  const lenses = await prisma.revenueLens.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] })
  return lenses.map((l) => ({
    id: l.id,
    name: l.name,
    userType: l.userType,
    isDefault: l.isDefault,
    active: l.active,
  }))
}
