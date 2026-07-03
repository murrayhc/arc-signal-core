import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { GET, POST } from '@/app/api/opportunities/[id]/playbook/route'

async function seedCard() {
  const sr = await prisma.scanRun.create({ data: {} })
  const event = await prisma.eventCandidate.create({
    data: {
      title: 'Layoff pressure — technology (UK)',
      eventType: 'LAYOFF_SIGNAL',
      eventClass: 'RISK',
      summary: 's',
      severity: 0.8,
      probability: 0.7,
      confidence: 0.8,
      affectedSector: 'technology',
      affectedRegion: 'UK',
      evidenceCount: 2,
      sourceDiversityScore: 1,
      signalStrength: 0.8,
      noveltyScore: 0.9,
      opportunityScore: 0.2,
      riskScore: 0.7,
      createdFromScanRunId: sr.id,
      isFixture: true,
    },
  })
  return prisma.opportunityCard.create({
    data: {
      eventCandidateId: event.id,
      title: 'Layoff pressure — talent acquisition angle',
      opportunityType: 'TALENT_ACQUISITION',
      summary: 'Derived from event.',
      buyerPain: 'Organisations in technology may face pressure that releases experienced staff.',
      likelyBuyersJson: JSON.stringify(['Recruiters', 'Workforce consultancies']),
      affectedSectorsJson: JSON.stringify(['technology']),
      affectedRegionsJson: JSON.stringify(['UK']),
      suggestedOffer: 'A recruiter could prepare interim or redeployment support.',
      urgencyScore: 0.7,
      commercialValueScore: 0.6,
      confidence: 0.72,
      evidenceScore: 0.65,
      actionabilityScore: 0.68,
      opportunityLogic: 'Watch for displaced talent that may need placement support.',
      riskLogic: 'The pattern could ease; monitor before committing resource.',
      nextBestAction: 'Review which employers may face similar pressure next.',
      status: 'NEW',
      isFixture: true,
    },
  })
}

const req = (url: string, method = 'GET') => new Request(url, { method })

describe('playbook API', () => {
  beforeEach(resetDb)

  it('GET /api/opportunities/[id]/playbook 200 generates-if-absent and returns the playbook', async () => {
    const card = await seedCard()
    const res = await GET(req(`http://t/api/opportunities/${card.id}/playbook`), {
      params: Promise.resolve({ id: card.id }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.opportunityCardId).toBe(card.id)
    expect(body.generatedBy).toBe('DETERMINISTIC')
    expect(body.discoveryQuestions).toBeInstanceOf(Array)
    expect(body.discoveryQuestionsJson).toBeUndefined()
    expect(body.likelyObjectionsJson).toBeUndefined()
    expect(body.proofPointsJson).toBeUndefined()
  })

  it('?format=json returns the export JSON', async () => {
    const card = await seedCard()
    const res = await GET(req(`http://t/api/opportunities/${card.id}/playbook?format=json`), {
      params: Promise.resolve({ id: card.id }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBeTruthy()
    expect(body.firstAction).toBeTruthy()
  })

  it('?format=md returns markdown text', async () => {
    const card = await seedCard()
    const res = await GET(req(`http://t/api/opportunities/${card.id}/playbook?format=md`), {
      params: Promise.resolve({ id: card.id }),
    })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('#')
  })

  it('404 for unknown card', async () => {
    const res = await GET(req('http://t/api/opportunities/nope/playbook'), {
      params: Promise.resolve({ id: 'nope' }),
    })
    expect(res.status).toBe(404)
  })

  it('POST regenerates the playbook', async () => {
    const card = await seedCard()
    await GET(req(`http://t/api/opportunities/${card.id}/playbook`), { params: Promise.resolve({ id: card.id }) })
    const res = await POST(req(`http://t/api/opportunities/${card.id}/playbook`, 'POST'), {
      params: Promise.resolve({ id: card.id }),
    })
    expect(res.status).toBe(200)
    expect(await prisma.opportunityPlaybook.count()).toBe(1)
  })
})
