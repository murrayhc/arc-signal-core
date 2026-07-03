import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import {
  generateOpportunities, isEligible, mapEventToOpportunity, scoreOpportunity,
} from '@/server/pipeline/opportunity'
import { resetDb } from '../helpers'
import type { EventCandidate, RevenueLens } from '@prisma/client'

function fakeEvent(over: Partial<EventCandidate> = {}): EventCandidate {
  return {
    id: 'e1', title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK',
    summary: 's', status: 'NEW', severity: 0.8, probability: 0.7, confidence: 0.8, timeWindowStart: null,
    timeWindowEnd: null, firstDetectedAt: new Date(), lastUpdatedAt: new Date(), primaryEntityId: null,
    affectedSector: 'technology', affectedRegion: 'UK', evidenceCount: 2, sourceDiversityScore: 1,
    signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2, riskScore: 0.7,
    createdFromScanRunId: 'sr1', isFixture: true, createdAt: new Date(),
    ...over,
  } as EventCandidate
}

describe('mapEventToOpportunity (pure)', () => {
  it('maps event types to opportunity types', () => {
    expect(mapEventToOpportunity('LAYOFF_SIGNAL')?.primary).toBe('TALENT_ACQUISITION')
    expect(mapEventToOpportunity('PROCUREMENT_INCREASE')?.primary).toBe('PROCUREMENT')
    expect(mapEventToOpportunity('REGULATORY_PRESSURE')?.primary).toBe('COMPLIANCE')
    expect(mapEventToOpportunity('DEMAND_SPIKE')?.primary).toBe('SALES')
    expect(mapEventToOpportunity('SUPPLY_CHAIN_PRESSURE')?.primary).toBe('COMPETITOR_DISPLACEMENT')
    expect(mapEventToOpportunity('SOMETHING_UNKNOWN')?.primary).toBe('CONTENT')
  })
})

describe('scoreOpportunity (pure)', () => {
  it('never exceeds event confidence and clamps to [0,1]', () => {
    const s = scoreOpportunity(fakeEvent(), null)
    expect(s.confidence).toBeLessThanOrEqual(0.8)
    for (const v of Object.values(s)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
  })

  it('byte-compatible: a null lens produces the same commercialValueScore as the pre-3f-4 hardcoded 0.5', () => {
    // lensValueSignal(null) must be 0.5 — the exact prior hardcoded placeholder — so this
    // score is unchanged from before the averageDealSize weighting was wired in.
    const event = fakeEvent()
    const s = scoreOpportunity(event, null)
    const expected = Math.round(
      Math.max(0, Math.min(1, 0.5 * Math.max(event.riskScore, event.opportunityScore) + 0.3 * 0.5 + 0.2 * s.urgencyScore)) * 100,
    ) / 100
    expect(s.commercialValueScore).toBe(expected)
  })

  it('byte-compatible: a default lens (isDefault, no averageDealSize) scores identically to a null lens', () => {
    const event = fakeEvent()
    const nullScore = scoreOpportunity(event, null)
    const defaultLens = { isDefault: true, averageDealSize: null } as RevenueLens
    const defaultScore = scoreOpportunity(event, defaultLens)
    expect(defaultScore.commercialValueScore).toBe(nullScore.commercialValueScore)
  })

  it('a lens with a large averageDealSize raises commercialValueScore above the default-lens score', () => {
    const event = fakeEvent()
    const defaultLens = { isDefault: true, averageDealSize: null } as RevenueLens
    const bigDealLens = { isDefault: false, averageDealSize: '£2m' } as RevenueLens

    const defaultScore = scoreOpportunity(event, defaultLens)
    const bigDealScore = scoreOpportunity(event, bigDealLens)
    expect(bigDealScore.commercialValueScore).toBeGreaterThan(defaultScore.commercialValueScore)
  })

  it('a lens with a small averageDealSize lowers commercialValueScore below the default-lens score', () => {
    const event = fakeEvent()
    const defaultLens = { isDefault: true, averageDealSize: null } as RevenueLens
    const smallDealLens = { isDefault: false, averageDealSize: '£5k' } as RevenueLens

    const defaultScore = scoreOpportunity(event, defaultLens)
    const smallDealScore = scoreOpportunity(event, smallDealLens)
    expect(smallDealScore.commercialValueScore).toBeLessThan(defaultScore.commercialValueScore)
  })
})

describe('isEligible (pure)', () => {
  it('skips dismissed events and excluded sectors', () => {
    expect(isEligible(fakeEvent(), null)).toBe(true)
    expect(isEligible(fakeEvent({ status: 'DISMISSED' }), null)).toBe(false)
    const lens = { excludedSectorsJson: JSON.stringify(['technology']) } as RevenueLens
    expect(isEligible(fakeEvent(), lens)).toBe(false)
  })
})

describe('generateOpportunities (persistence)', () => {
  beforeEach(resetDb)

  async function seedEvent(over: Partial<EventCandidate> = {}) {
    const sr = await prisma.scanRun.create({ data: {} })
    return prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.8, probability: 0.7, confidence: 0.8, affectedSector: 'technology', affectedRegion: 'UK',
        evidenceCount: 2, sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: sr.id, isFixture: true, ...over,
      },
    })
  }

  it('creates a card linked to its event with clean non-advisory text', async () => {
    const event = await seedEvent()
    const { created, errors } = await generateOpportunities([event], null)
    expect(errors).toHaveLength(0)
    expect(created).toHaveLength(1)
    const card = created[0]
    expect(card.eventCandidateId).toBe(event.id)
    expect(card.opportunityType).toBe('TALENT_ACQUISITION')
    expect(card.isFixture).toBe(true)
    const likelyBuyers = JSON.parse(card.likelyBuyersJson) as string[]
    for (const field of [card.title, card.summary, card.buyerPain, card.suggestedOffer, card.opportunityLogic, card.riskLogic, card.nextBestAction, ...likelyBuyers]) {
      expect(findAdviceLanguage(field)).toEqual([])
    }
  })

  it('updates rather than duplicates on a second run, marking RISING when value rises', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', isDefault: true } })
    await generateOpportunities([event], lens)
    const stronger = await prisma.eventCandidate.update({ where: { id: event.id }, data: { confidence: 0.95, riskScore: 0.9 } })
    const second = await generateOpportunities([stronger], lens)
    expect(second.created).toHaveLength(0)
    expect(second.updated).toHaveLength(1)
    expect(second.updated[0].status).toBe('RISING')
    expect(await prisma.opportunityCard.count()).toBe(1)
  })

  it('never overwrites a dismissed card', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', isDefault: true } })
    const first = await generateOpportunities([event], lens)
    await prisma.opportunityCard.update({ where: { id: first.created[0].id }, data: { status: 'DISMISSED' } })
    const second = await generateOpportunities([event], lens)
    expect(second.updated[0].status).toBe('DISMISSED')
  })

  it('skips excluded-sector events', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', excludedSectorsJson: JSON.stringify(['technology']) } })
    const { created } = await generateOpportunities([event], lens)
    expect(created).toHaveLength(0)
  })
})
