import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import * as portfolioService from '@/server/portfolio/service'
import { GET as getWatchList, POST as postWatch } from '@/app/api/watch/route'
import { GET as getWatchOne, PATCH as patchWatch, DELETE as deleteWatch } from '@/app/api/watch/[id]/route'
import { GET as getPortfolioList, POST as postPortfolio } from '@/app/api/portfolio/route'
import { PATCH as patchPortfolio } from '@/app/api/portfolio/[id]/route'

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function getReq(url: string) {
  return new Request(url)
}

describe('watch + portfolio API', () => {
  beforeEach(async () => {
    await resetDb()
  })

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
        evidenceScore: 0.82,
        actionabilityScore: 0.64,
        opportunityLogic: 'l',
        riskLogic: 'r',
        nextBestAction: 'Reach out this week.',
        isFixture: true,
      },
    })
  }

  describe('/api/watch', () => {
    it('POST creates a watch market', async () => {
      const res = await postWatch(
        jsonReq('http://test.local/api/watch', 'POST', {
          name: 'Lithium supply chain',
          sectors: ['Mining'],
          regions: ['Chile'],
          themes: [],
          queryTerms: ['lithium'],
        }),
      )
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.name).toBe('Lithium supply chain')
      expect(body.sectors).toEqual(['Mining'])

      const listRes = await getWatchList()
      const listBody = await listRes.json()
      expect(listBody).toHaveLength(1)
    })

    it('POST with missing name returns 400', async () => {
      const res = await postWatch(jsonReq('http://test.local/api/watch', 'POST', { sectors: [] }))
      expect(res.status).toBe(400)
    })

    it('POST with a duplicate name returns 409 (not an unhandled 500)', async () => {
      await postWatch(jsonReq('http://test.local/api/watch', 'POST', { name: 'Lithium supply chain' }))
      const res = await postWatch(jsonReq('http://test.local/api/watch', 'POST', { name: 'Lithium supply chain' }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
    })

    it('PATCH /api/watch/[id] to a name already used by another market returns 409', async () => {
      await postWatch(jsonReq('http://test.local/api/watch', 'POST', { name: 'Existing name' }))
      const createRes = await postWatch(jsonReq('http://test.local/api/watch', 'POST', { name: 'To rename' }))
      const created = await createRes.json()

      const res = await patchWatch(
        jsonReq(`http://test.local/api/watch/${created.id}`, 'PATCH', { name: 'Existing name' }),
        { params: Promise.resolve({ id: created.id }) },
      )
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
    })

    it('GET /api/watch/[id] returns 404 for an unknown id', async () => {
      const res = await getWatchOne(getReq('http://test.local/api/watch/nope'), { params: Promise.resolve({ id: 'nope' }) })
      expect(res.status).toBe(404)
    })

    it('GET /api/watch/[id] returns the market by id', async () => {
      const createRes = await postWatch(
        jsonReq('http://test.local/api/watch', 'POST', { name: 'AI regulation', sectors: [], regions: [], themes: [], queryTerms: ['AI Act'] }),
      )
      const created = await createRes.json()

      const res = await getWatchOne(getReq(`http://test.local/api/watch/${created.id}`), { params: Promise.resolve({ id: created.id }) })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('AI regulation')
    })

    it('GET /api/watch/[id]?resolve=1 returns matching events/opportunities', async () => {
      const card = await seedCard()
      const createRes = await postWatch(
        jsonReq('http://test.local/api/watch', 'POST', {
          name: 'Tech layoffs',
          sectors: ['technology'],
          regions: [],
          themes: [],
          queryTerms: [],
        }),
      )
      const created = await createRes.json()

      const res = await getWatchOne(
        getReq(`http://test.local/api/watch/${created.id}?resolve=1`),
        { params: Promise.resolve({ id: created.id }) },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.market.id).toBe(created.id)
      expect(Array.isArray(body.events)).toBe(true)
      const eventIds = body.events.map((e: { id: string }) => e.id)
      expect(eventIds).toContain((await prisma.eventCandidate.findFirstOrThrow({ where: { id: card.eventCandidateId } })).id)
    })

    it('PATCH /api/watch/[id] updates fields', async () => {
      const createRes = await postWatch(
        jsonReq('http://test.local/api/watch', 'POST', { name: 'Cobalt watch', sectors: [], regions: [], themes: [], queryTerms: [] }),
      )
      const created = await createRes.json()

      const res = await patchWatch(
        jsonReq(`http://test.local/api/watch/${created.id}`, 'PATCH', { active: false }),
        { params: Promise.resolve({ id: created.id }) },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.active).toBe(false)
    })

    it('PATCH /api/watch/[id] returns 404 for an unknown id', async () => {
      const res = await patchWatch(
        jsonReq('http://test.local/api/watch/nope', 'PATCH', { active: false }),
        { params: Promise.resolve({ id: 'nope' }) },
      )
      expect(res.status).toBe(404)
    })

    it('DELETE /api/watch/[id] removes the market', async () => {
      const createRes = await postWatch(
        jsonReq('http://test.local/api/watch', 'POST', { name: 'Temp market', sectors: [], regions: [], themes: [], queryTerms: [] }),
      )
      const created = await createRes.json()

      const res = await deleteWatch(getReq(`http://test.local/api/watch/${created.id}`), { params: Promise.resolve({ id: created.id }) })
      expect(res.status).toBe(200)

      const getRes = await getWatchOne(getReq(`http://test.local/api/watch/${created.id}`), { params: Promise.resolve({ id: created.id }) })
      expect(getRes.status).toBe(404)
    })
  })

  describe('/api/portfolio', () => {
    it('POST creates an item from a card id', async () => {
      const card = await seedCard()
      const res = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.opportunityCardId).toBe(card.id)
      expect(body.status).toBe('NEW')
      expect(body.evidenceStrength).toBe(0.82)
    })

    it('POST with missing opportunityCardId returns 400', async () => {
      const res = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', {}))
      expect(res.status).toBe(400)
    })

    it('POST with an unknown card id returns 404', async () => {
      const res = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: 'nope' }))
      expect(res.status).toBe(404)
    })

    it('POST is idempotent — re-posting the same card returns the same item, 200', async () => {
      const card = await seedCard()
      const firstRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      const first = await firstRes.json()

      const secondRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      expect(secondRes.status).toBe(200)
      const second = await secondRes.json()
      expect(second.id).toBe(first.id)

      const listRes = await getPortfolioList(getReq('http://test.local/api/portfolio'))
      expect(await listRes.json()).toHaveLength(1)
    })

    it('POST re-add race (P2002 on opportunityCardId) returns the existing item, 200 (not an unhandled 500)', async () => {
      const card = await seedCard()
      const firstRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      const first = await firstRes.json()

      // Simulate the TOCTOU race: another request creates the row directly between this
      // route's existence-check and its own `addToPortfolio` call, so the route's call
      // hits P2002 rather than taking the already-exists early-return path. Spying on the
      // service module (a plain ES module namespace) rather than the raw Prisma client
      // proxy — `vi.spyOn().mockRestore()` does not safely reinstate Prisma's proxied
      // model methods (verified: it leaves them non-callable for later tests).
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`opportunityCardId`)', {
        code: 'P2002',
        clientVersion: '6.10.0',
      })
      const spy = vi.spyOn(portfolioService, 'addToPortfolio').mockRejectedValueOnce(p2002)

      try {
        const res = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.id).toBe(first.id)
        expect(body.opportunityCardId).toBe(card.id)
      } finally {
        spy.mockRestore()
      }

      // The mock is fully restored — the client stays usable for subsequent tests.
      const afterRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      expect(afterRes.status).toBe(200)
    })

    it('GET lists all portfolio items', async () => {
      const card = await seedCard()
      await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      const res = await getPortfolioList(getReq('http://test.local/api/portfolio'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
    })

    it('PATCH /api/portfolio/[id] updates status', async () => {
      const card = await seedCard()
      const createRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      const created = await createRes.json()

      const res = await patchPortfolio(
        jsonReq(`http://test.local/api/portfolio/${created.id}`, 'PATCH', { status: 'QUALIFIED' }),
        { params: Promise.resolve({ id: created.id }) },
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('QUALIFIED')
    })

    it('PATCH /api/portfolio/[id] with an invalid status returns 400', async () => {
      const card = await seedCard()
      const createRes = await postPortfolio(jsonReq('http://test.local/api/portfolio', 'POST', { opportunityCardId: card.id }))
      const created = await createRes.json()

      const res = await patchPortfolio(
        jsonReq(`http://test.local/api/portfolio/${created.id}`, 'PATCH', { status: 'BOGUS' }),
        { params: Promise.resolve({ id: created.id }) },
      )
      expect(res.status).toBe(400)
    })

    it('PATCH /api/portfolio/[id] returns 404 for an unknown id', async () => {
      const res = await patchPortfolio(
        jsonReq('http://test.local/api/portfolio/nope', 'PATCH', { status: 'QUALIFIED' }),
        { params: Promise.resolve({ id: 'nope' }) },
      )
      expect(res.status).toBe(404)
    })
  })
})
