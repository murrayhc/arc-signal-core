import { prisma } from '@/server/db'
import { PORTFOLIO_STATUSES, type PortfolioStatus } from '@/shared/enums'

export type PortfolioItemData = {
  id: string
  opportunityCardId: string
  status: PortfolioStatus
  estimatedValue: string | null
  owner: string | null
  nextAction: string | null
  deadline: string | null
  evidenceStrength: number
  buyerClarity: number
  confidenceMovement: number
  createdAt: string
  updatedAt: string
}

type PortfolioItemRow = {
  id: string
  opportunityCardId: string
  status: string
  estimatedValue: string | null
  owner: string | null
  nextAction: string | null
  deadline: Date | null
  evidenceStrength: number
  buyerClarity: number
  confidenceMovement: number
  createdAt: Date
  updatedAt: Date
}

function toPortfolioItemData(row: PortfolioItemRow): PortfolioItemData {
  return {
    id: row.id,
    opportunityCardId: row.opportunityCardId,
    status: row.status as PortfolioStatus,
    estimatedValue: row.estimatedValue,
    owner: row.owner,
    nextAction: row.nextAction,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    evidenceStrength: row.evidenceStrength,
    buyerClarity: row.buyerClarity,
    confidenceMovement: row.confidenceMovement,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class PortfolioCardNotFoundError extends Error {
  constructor(opportunityCardId: string) {
    super(`OpportunityCard not found: ${opportunityCardId}`)
    this.name = 'PortfolioCardNotFoundError'
  }
}

export class InvalidPortfolioStatusError extends Error {
  constructor(status: string) {
    super(`Invalid portfolio status: ${status}`)
    this.name = 'InvalidPortfolioStatusError'
  }
}

/**
 * Idempotent on `opportunityCardId`: re-adding the same card returns the
 * existing item unchanged (status stays as-is, scores are not recomputed).
 * On first add, scores are seeded from the card's own scoring:
 * evidenceStrength <- card.evidenceScore, buyerClarity <- card.actionabilityScore.
 * confidenceMovement starts at 0 — there's no confidence history yet; Task 3's
 * graph-event timeline can enrich this later.
 */
export async function addToPortfolio(opportunityCardId: string): Promise<PortfolioItemData> {
  const existing = await prisma.opportunityPortfolioItem.findUnique({ where: { opportunityCardId } })
  if (existing) return toPortfolioItemData(existing)

  const card = await prisma.opportunityCard.findUnique({ where: { id: opportunityCardId } })
  if (!card) throw new PortfolioCardNotFoundError(opportunityCardId)

  const row = await prisma.opportunityPortfolioItem.create({
    data: {
      opportunityCardId: card.id,
      status: 'NEW',
      evidenceStrength: card.evidenceScore,
      buyerClarity: card.actionabilityScore,
      confidenceMovement: 0,
    },
  })
  return toPortfolioItemData(row)
}

export async function getPortfolioItem(id: string): Promise<PortfolioItemData | null> {
  const row = await prisma.opportunityPortfolioItem.findUnique({ where: { id } })
  return row ? toPortfolioItemData(row) : null
}

export type UpdatePortfolioItemInput = Partial<{
  status: string
  owner: string | null
  nextAction: string | null
  deadline: Date | null
  estimatedValue: string | null
}>

export async function updatePortfolioItem(id: string, patch: UpdatePortfolioItemInput): Promise<PortfolioItemData | null> {
  const existing = await prisma.opportunityPortfolioItem.findUnique({ where: { id } })
  if (!existing) return null

  if (patch.status !== undefined && !(PORTFOLIO_STATUSES as readonly string[]).includes(patch.status)) {
    throw new InvalidPortfolioStatusError(patch.status)
  }

  const row = await prisma.opportunityPortfolioItem.update({
    where: { id },
    data: {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.owner !== undefined ? { owner: patch.owner } : {}),
      ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
      ...(patch.deadline !== undefined ? { deadline: patch.deadline } : {}),
      ...(patch.estimatedValue !== undefined ? { estimatedValue: patch.estimatedValue } : {}),
    },
  })
  return toPortfolioItemData(row)
}

export type ListPortfolioFilter = { status?: string }

export async function listPortfolio(filter?: ListPortfolioFilter): Promise<PortfolioItemData[]> {
  const rows = await prisma.opportunityPortfolioItem.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toPortfolioItemData)
}
