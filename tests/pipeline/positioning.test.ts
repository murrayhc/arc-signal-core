import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { generatePositioning, opportunityTypeToUserTypes } from '@/server/pipeline/positioning'
import { resetDb } from '../helpers'

describe('opportunityTypeToUserTypes (pure)', () => {
  it('keys user types off opportunity type', () => {
    expect(opportunityTypeToUserTypes('TALENT_ACQUISITION')).toContain('RECRUITER')
    expect(opportunityTypeToUserTypes('PROCUREMENT')).toContain('PROCUREMENT')
    expect(opportunityTypeToUserTypes('COMPLIANCE')).toContain('ADVISOR')
  })
})

describe('generatePositioning', () => {
  beforeEach(resetDb)

  async function seedCard() {
    const sr = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.8, probability: 0.7, confidence: 0.8, affectedSector: 'technology', affectedRegion: 'UK',
        evidenceCount: 2, sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: sr.id, isFixture: true,
      },
    })
    const card = await prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id, title: 'Talent window', opportunityType: 'TALENT_ACQUISITION', summary: 's',
        buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.6, commercialValueScore: 0.5, confidence: 0.8,
        evidenceScore: 0.7, actionabilityScore: 0.6, opportunityLogic: 'ol', riskLogic: 'rl',
        nextBestAction: 'review buyer groups', isFixture: true,
      },
    })
    return { ...card, eventCandidate: event }
  }

  it('creates guard-clean examples keyed to user types, with the non-advisory constraint', async () => {
    const card = await seedCard()
    const { created, errors } = await generatePositioning([card], null)
    expect(errors).toHaveLength(0)
    expect(created.length).toBeGreaterThanOrEqual(1)
    for (const ex of created) {
      for (const f of [ex.title, ex.positioningAngle, ex.howItCouldBeUsed, ex.whyItMayMatter, ex.evidenceSummary, ex.constraints]) {
        expect(findAdviceLanguage(f)).toEqual([])
      }
      expect(ex.constraints).toContain('not investment advice')
      expect(ex.eventCandidateId).toBe(card.eventCandidateId)
      expect(ex.opportunityCardId).toBe(card.id)
    }
  })

  it('regenerates (delete + recreate) on a second call, no accumulation', async () => {
    const card = await seedCard()
    await generatePositioning([card], null)
    const n1 = await prisma.strategicPositioningExample.count()
    await generatePositioning([card], null)
    const n2 = await prisma.strategicPositioningExample.count()
    expect(n2).toBe(n1)
  })
})
