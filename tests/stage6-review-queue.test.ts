import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { decideReviewItem, listReviewItems, reviewQueueCounts, upsertReviewItem } from '@/server/review/service'
import { produceEventReviews, produceQuarantineReviews } from '@/server/review/producers'
import { resetDb } from './helpers'
import { makeClaim, makeDocument, makeEventGraph, makeSource } from './factories'

describe('review queue service', () => {
  beforeEach(resetDb)

  it('upserts idempotently on dedupeKey and refreshes only PENDING items', async () => {
    const first = await upsertReviewItem({
      itemType: 'QUARANTINED_CLAIM',
      subjectKind: 'claim',
      subjectId: 'claim-1',
      dedupeKey: 'quarantine:claim-1',
      title: 'T',
      reason: 'first reason',
    })
    const second = await upsertReviewItem({
      itemType: 'QUARANTINED_CLAIM',
      subjectKind: 'claim',
      subjectId: 'claim-1',
      dedupeKey: 'quarantine:claim-1',
      title: 'T',
      reason: 'updated reason',
    })
    expect(second.id).toBe(first.id) // same item
    expect(second.reason).toBe('updated reason') // refreshed while PENDING
    expect(await prisma.reviewItem.count()).toBe(1)

    // Once a human decides, a later scan does NOT reopen or overwrite it.
    await decideReviewItem(first.id, 'REJECTED', 'not a real signal')
    const third = await upsertReviewItem({
      itemType: 'QUARANTINED_CLAIM',
      subjectKind: 'claim',
      subjectId: 'claim-1',
      dedupeKey: 'quarantine:claim-1',
      title: 'T',
      reason: 'a third pass',
    })
    expect(third.status).toBe('REJECTED')
    expect(third.reason).toBe('updated reason') // unchanged from the pre-decision state
  })

  it('records decisions and reports counts', async () => {
    for (let i = 0; i < 3; i++) {
      await upsertReviewItem({
        itemType: 'LOW_CONFIDENCE_IMPACT',
        subjectKind: 'companyImpact',
        subjectId: `imp-${i}`,
        dedupeKey: `low-impact:imp-${i}`,
        title: 'T',
        reason: 'r',
      })
    }
    const pending = await listReviewItems({ status: 'PENDING' })
    expect(pending).toHaveLength(3)

    await decideReviewItem(pending[0].id, 'APPROVED')
    await decideReviewItem(pending[1].id, 'NEEDS_MORE_EVIDENCE', 'need the origin')

    const counts = await reviewQueueCounts()
    expect(counts.PENDING).toBe(1)
    expect(counts.APPROVED).toBe(1)
    expect(counts.NEEDS_MORE_EVIDENCE).toBe(1)
  })
})

describe('review producers', () => {
  beforeEach(resetDb)

  it('turns quarantined claims into review items', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    const n = await produceQuarantineReviews([{ claimId: claim.id, reason: 'RECYCLED: widely copied, no independent corroboration' }])
    expect(n).toBe(1)
    const item = await prisma.reviewItem.findFirstOrThrow({ where: { itemType: 'QUARANTINED_CLAIM' } })
    expect(item.subjectId).toBe(claim.id)
    expect(item.reason).toContain('RECYCLED')
  })

  it('flags low-confidence named impacts but not confident ones', async () => {
    const { event } = await makeEventGraph('Voltcore Ltd will cut 400 jobs at its Manchester plant.', {
      eventClass: 'RISK',
      sector: 'manufacturing',
    })
    // Two named impacts: one below the floor, one above.
    const entity = await prisma.entity.create({ data: { name: 'Voltcore', canonicalKey: 'voltcore' } })
    await prisma.companyImpact.create({
      data: {
        eventCandidateId: event.id,
        entityId: entity.id,
        companyName: 'Voltcore (weak)',
        impactType: 'HARMED',
        impactPathway: 'p',
        confidence: 0.2,
        evidenceIdsJson: '[]',
        riskScore: 0.6,
        opportunityScore: 0.2,
      },
    })
    const strongEntity = await prisma.entity.create({ data: { name: 'Meridian', canonicalKey: 'meridian' } })
    await prisma.companyImpact.create({
      data: {
        eventCandidateId: event.id,
        entityId: strongEntity.id,
        companyName: 'Meridian (strong)',
        impactType: 'HARMED',
        impactPathway: 'p',
        confidence: 0.8,
        evidenceIdsJson: '[]',
        riskScore: 0.6,
        opportunityScore: 0.2,
      },
    })

    await produceEventReviews(event.id)
    const flags = await prisma.reviewItem.findMany({ where: { itemType: 'LOW_CONFIDENCE_IMPACT' } })
    expect(flags).toHaveLength(1)
    expect(flags[0].reason).toContain('Voltcore (weak)')
  })

  it('raises a contradiction-spike item when event evidence is disputed', async () => {
    const { event } = await makeEventGraph('Voltcore Ltd will cut 400 jobs at its Manchester plant.', {
      eventClass: 'RISK',
      sector: 'manufacturing',
    })
    // Attach a claim cluster with contradictions to one of the event's canonical claims.
    const { canonicalIdsForEvent } = await import('@/server/evidence/investigation-loop')
    const canonicalIds = await canonicalIdsForEvent(event.id)
    expect(canonicalIds.length).toBeGreaterThan(0)
    await prisma.claimCluster.updateMany({
      where: { canonicalClaimId: canonicalIds[0] },
      data: { contradictionCount: 3 },
    })

    await produceEventReviews(event.id)
    const spike = await prisma.reviewItem.findFirst({ where: { itemType: 'CONTRADICTION_SPIKE' } })
    expect(spike).not.toBeNull()
    expect(spike!.severity).toBeGreaterThan(0.6)
  })
})

describe('review API', () => {
  beforeEach(resetDb)

  it('GET lists items with counts; PATCH records a decision; 404 for unknown', async () => {
    await upsertReviewItem({
      itemType: 'MANIPULATION_ALERT',
      subjectKind: 'event',
      subjectId: 'ev-1',
      dedupeKey: 'manipulation:c1',
      title: 'Possible coordinated amplification',
      reason: 'copy burst',
      severity: 0.75,
    })

    const { GET } = await import('@/app/api/review/route')
    const listRes = await GET(new Request('http://local/api/review?status=PENDING'))
    const body = await listRes.json()
    expect(body.items).toHaveLength(1)
    expect(body.counts.PENDING).toBe(1)

    const { PATCH } = await import('@/app/api/review/[id]/route')
    const id = body.items[0].id
    const patchRes = await PATCH(
      new Request(`http://local/api/review/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED', reviewerNote: 'organic pickup, fine' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id }) },
    )
    expect(patchRes.status).toBe(200)
    const decided = await prisma.reviewItem.findUniqueOrThrow({ where: { id } })
    expect(decided.status).toBe('APPROVED')
    expect(decided.reviewerNote).toContain('organic pickup')

    const missing = await PATCH(
      new Request('http://local/api/review/nope', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(missing.status).toBe(404)
  })

  it('rejects an invalid status', async () => {
    const { PATCH } = await import('@/app/api/review/[id]/route')
    const res = await PATCH(
      new Request('http://local/api/review/x', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'BOGUS' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'x' }) },
    )
    expect(res.status).toBe(400)
  })
})
