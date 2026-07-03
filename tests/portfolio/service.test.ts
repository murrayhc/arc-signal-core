import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { addToPortfolio, updatePortfolioItem, listPortfolio, getPortfolioItem } from '@/server/portfolio/service'

describe('opportunity portfolio service', () => {
  beforeEach(async () => {
    await resetDb()
  })

  async function seedCard(overrides: Partial<{ evidenceScore: number; actionabilityScore: number }> = {}) {
    const sr = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.8, probability: 0.7, confidence: 0.8, affectedSector: 'technology', affectedRegion: 'UK',
        evidenceCount: 2, sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: sr.id, isFixture: true,
      },
    })
    return prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id,
        title: 'Talent acquisition window',
        opportunityType: 'TALENT_ACQUISITION',
        summary: 'Layoffs create a hiring window.',
        buyerPain: 'Needs experienced engineers fast.',
        suggestedOffer: 'Targeted outreach to affected staff.',
        urgencyScore: 0.7,
        commercialValueScore: 0.6,
        confidence: 0.75,
        evidenceScore: overrides.evidenceScore ?? 0.82,
        actionabilityScore: overrides.actionabilityScore ?? 0.64,
        opportunityLogic: 'l',
        riskLogic: 'r',
        nextBestAction: 'Reach out this week.',
        isFixture: true,
      },
    })
  }

  it('addToPortfolio creates an item with status NEW and scores from the card', async () => {
    const card = await seedCard({ evidenceScore: 0.82, actionabilityScore: 0.64 })
    const item = await addToPortfolio(card.id)

    expect(item.opportunityCardId).toBe(card.id)
    expect(item.status).toBe('NEW')
    expect(item.evidenceStrength).toBe(0.82)
    expect(item.buyerClarity).toBe(0.64)
    expect(item.confidenceMovement).toBe(0)

    const rows = await prisma.opportunityPortfolioItem.findMany()
    expect(rows).toHaveLength(1)
  })

  it('addToPortfolio is idempotent — re-adding the same card returns the existing item', async () => {
    const card = await seedCard()
    const first = await addToPortfolio(card.id)
    await updatePortfolioItem(first.id, { status: 'QUALIFIED' })

    const second = await addToPortfolio(card.id)
    expect(second.id).toBe(first.id)
    expect(second.status).toBe('QUALIFIED') // status stays as-is, not reset to NEW

    const rows = await prisma.opportunityPortfolioItem.findMany()
    expect(rows).toHaveLength(1) // count stays 1
  })

  it('addToPortfolio throws for an unknown card id', async () => {
    await expect(addToPortfolio('does-not-exist')).rejects.toThrow()
  })

  it('updatePortfolioItem persists a valid status change to QUALIFIED', async () => {
    const card = await seedCard()
    const item = await addToPortfolio(card.id)

    const updated = await updatePortfolioItem(item.id, { status: 'QUALIFIED' })
    expect(updated?.status).toBe('QUALIFIED')

    const refetched = await getPortfolioItem(item.id)
    expect(refetched?.status).toBe('QUALIFIED')
  })

  it('updatePortfolioItem rejects an invalid status', async () => {
    const card = await seedCard()
    const item = await addToPortfolio(card.id)

    await expect(updatePortfolioItem(item.id, { status: 'NOT_A_REAL_STATUS' as never })).rejects.toThrow()

    const refetched = await getPortfolioItem(item.id)
    expect(refetched?.status).toBe('NEW') // unchanged
  })

  it('updatePortfolioItem persists owner/nextAction/deadline/estimatedValue', async () => {
    const card = await seedCard()
    const item = await addToPortfolio(card.id)
    const deadline = new Date('2026-08-01T00:00:00.000Z')

    const updated = await updatePortfolioItem(item.id, {
      owner: 'Jordan',
      nextAction: 'Call the hiring manager',
      deadline,
      estimatedValue: '£25,000',
    })

    expect(updated?.owner).toBe('Jordan')
    expect(updated?.nextAction).toBe('Call the hiring manager')
    expect(updated?.deadline).toEqual(deadline.toISOString())
    expect(updated?.estimatedValue).toBe('£25,000')
  })

  it('updatePortfolioItem returns null for an unknown id', async () => {
    expect(await updatePortfolioItem('does-not-exist', { status: 'QUALIFIED' })).toBeNull()
  })

  it('listPortfolio returns all items, and filters by status', async () => {
    const cardA = await seedCard()
    const cardB = await seedCard()
    const itemA = await addToPortfolio(cardA.id)
    await addToPortfolio(cardB.id)
    await updatePortfolioItem(itemA.id, { status: 'QUALIFIED' })

    expect(await listPortfolio()).toHaveLength(2)
    const qualifiedOnly = await listPortfolio({ status: 'QUALIFIED' })
    expect(qualifiedOnly).toHaveLength(1)
    expect(qualifiedOnly[0].id).toBe(itemA.id)
  })

  it('never leaks a raw *Json field — there are none on this model, but output must stay fully serialized', async () => {
    const card = await seedCard()
    const item = await addToPortfolio(card.id)
    expect(typeof item.status).toBe('string')
    expect(typeof item.evidenceStrength).toBe('number')
    expect(typeof item.createdAt).toBe('string')
  })
})
