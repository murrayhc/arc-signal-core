import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from './helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from './factories'

describe('event discovery data layer', () => {
  beforeEach(resetDb)

  it('creates the full evidence chain: source → document → claim → signal → cluster → event', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    const signal = await makeSignal(claim.id, doc.id, source.id)

    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)',
        eventType: 'LAYOFF_SIGNAL',
        eventClass: 'RISK',
        summary: 'Test event',
        severity: 0.8,
        probability: 0.7,
        confidence: 0.8,
        evidenceCount: 1,
        sourceDiversityScore: 1,
        signalStrength: 0.7,
        noveltyScore: 0.9,
        opportunityScore: 0.2,
        riskScore: 0.7,
        createdFromScanRunId: scanRun.id,
        isFixture: true,
      },
    })
    const cluster = await prisma.signalCluster.create({
      data: {
        title: 'Layoff signals — technology (UK)',
        clusterType: 'LAYOFF_SIGNAL',
        strength: 0.7,
        confidence: 0.8,
        novelty: 0.9,
        explanation: 'Test cluster',
        isFixture: true,
        eventCandidateId: event.id,
        signals: { create: [{ signalId: signal.id }] },
      },
    })

    const loaded = await prisma.eventCandidate.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        clusters: { include: { signals: { include: { signal: { include: { claim: true, document: { include: { source: true } } } } } } } },
      },
    })
    expect(loaded.primaryEntityId).toBeNull()
    expect(loaded.clusters).toHaveLength(1)
    expect(loaded.clusters[0].id).toBe(cluster.id)
    const chainSignal = loaded.clusters[0].signals[0].signal
    expect(chainSignal.claim.id).toBe(claim.id)
    expect(chainSignal.document.source.id).toBe(source.id)
  })

  it('enforces document dedupe on (sourceId, rawContentHash)', async () => {
    const source = await makeSource()
    await makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' })
    await expect(
      makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' }),
    ).rejects.toThrow()
  })

  it('enforces one signal per claim', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    await makeSignal(claim.id, doc.id, source.id)
    await expect(makeSignal(claim.id, doc.id, source.id)).rejects.toThrow()
  })
})
