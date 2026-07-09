import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { createSignals } from '@/server/pipeline/signals'
import { clusterSignals, computeNovelty } from '@/server/pipeline/cluster'
import { createEventCandidates } from '@/server/pipeline/events'
import { persistEventMomentum } from '@/server/graph/timeline'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeClaim, makeDocument, makeSource } from './factories'

/** A canonical claim with a KNOWN reliability + factuality, plus an atomic
 *  claim on the given document linking to it — the evidence-layer state the
 *  signal stage derives from. */
async function makeScoredCanonical(
  documentId: string,
  sourceId: string,
  opts: { reliability: number; factuality: string; independent?: number; commodities?: string[] },
) {
  const canonical = await prisma.canonicalClaim.create({
    data: {
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      normalisedClaimText: 'voltcore cut 400 jobs manchester plant',
      claimType: 'LAYOFF_SIGNAL',
      reliabilityScore: opts.reliability,
      factualityLabel: opts.factuality,
      independentSourceCount: opts.independent ?? 1,
      status: 'ACTIVE',
    },
  })
  await makeAtomicClaim({
    canonicalClaimId: canonical.id,
    documentId,
    sourceId,
    claimType: 'LAYOFF_SIGNAL',
    claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
    commoditiesJson: JSON.stringify(opts.commodities ?? []),
  })
  return canonical
}

describe('Stage 2: signal confidence derives from evidence reliability', () => {
  beforeEach(resetDb)

  it('links a signal to its canonical claim and derives confidence from reliability', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { rawContent: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    const canonical = await makeScoredCanonical(doc.id, source.id, {
      reliability: 0.8,
      factuality: 'STRONGLY_SUPPORTED',
      independent: 3,
    })
    const claim = await makeClaim(doc.id, {
      claimType: 'LAYOFF_MENTION',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
    })

    const { signals, quarantined } = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(quarantined).toHaveLength(0)
    expect(signals).toHaveLength(1)
    expect(signals[0].canonicalClaimId).toBe(canonical.id)
    // confidence = 0.25 + 0.75 × reliability(0.8) = 0.85 — NOT the regex constant.
    expect(signals[0].confidence).toBeCloseTo(0.85, 2)
    expect(signals[0].explanation).toContain('evidence reliability 0.80')

    // Weak evidence produces a weaker signal — the whole point of the wiring.
    const weakSource = await makeSource()
    const weakDoc = await makeDocument(weakSource.id, { rawContent: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    await makeScoredCanonical(weakDoc.id, weakSource.id, { reliability: 0.2, factuality: 'WEAK_SINGLE_SOURCE' })
    const weakClaim = await makeClaim(weakDoc.id, {
      claimType: 'LAYOFF_MENTION',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
    })
    const weak = await createSignals([weakClaim], new Map([[weakDoc.id, weakDoc]]))
    expect(weak.signals[0].confidence).toBeCloseTo(0.4, 2)
    expect(weak.signals[0].confidence).toBeLessThan(signals[0].confidence)
  })

  it('falls back to extraction confidence when no evidence-layer link exists (never fabricates)', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id, { claimType: 'LAYOFF_MENTION', extractionConfidence: 0.75 })
    const { signals } = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(signals).toHaveLength(1)
    expect(signals[0].canonicalClaimId).toBeNull()
    expect(signals[0].confidence).toBe(0.75)
    expect(signals[0].explanation).toContain('no evidence-layer link')
  })
})

describe('Stage 2: recycled/contradicted evidence is quarantined from events', () => {
  beforeEach(resetDb)

  it.each(['RECYCLED', 'CONTRADICTED'])('a %s claim creates NO signal and is flagged for review', async (label) => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { rawContent: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    await makeScoredCanonical(doc.id, source.id, { reliability: 0.15, factuality: label })
    const claim = await makeClaim(doc.id, {
      claimType: 'LAYOFF_MENTION',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
    })

    const { signals, quarantined } = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(signals).toHaveLength(0)
    expect(quarantined).toHaveLength(1)
    expect(quarantined[0].reason).toContain(label)

    // Flagged, not silently dropped.
    const reloaded = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } })
    expect(reloaded.needsReview).toBe(true)
    expect(await prisma.signal.count()).toBe(0)
  })
})

describe('Stage 2: first-class event exposure and continuous novelty', () => {
  beforeEach(resetDb)

  it('promotes commodities from the atomic claims onto the event', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { rawContent: 'Lithium shortage pressures Voltcore; 400 jobs to go.' })
    await makeScoredCanonical(doc.id, source.id, {
      reliability: 0.7,
      factuality: 'SUPPORTED',
      commodities: ['lithium'],
    })
    const claim = await makeClaim(doc.id, {
      claimType: 'LAYOFF_MENTION',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      sector: 'manufacturing',
      region: 'UK',
    })
    const { signals } = await createSignals([claim], new Map([[doc.id, doc]]))
    const { clusters } = await clusterSignals(signals)
    expect(clusters).toHaveLength(1)
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { events } = await createEventCandidates(clusters, scanRun.id)
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0].commoditiesJson)).toEqual(['lithium'])
  })

  it('novelty is continuous in the recency of the last same-shape cluster, not binary', () => {
    expect(computeNovelty(null)).toBe(0.9) // never seen
    const justSeen = computeNovelty(0)
    const lastWeek = computeNovelty(7)
    const dormant = computeNovelty(60)
    expect(justSeen).toBeCloseTo(0.2, 2)
    expect(lastWeek).toBeGreaterThan(justSeen)
    expect(lastWeek).toBeLessThan(dormant)
    expect(dormant).toBeCloseTo(0.9, 2)
  })

  it('a same-shape cluster created moments ago yields near-minimum novelty', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id, {
      claimType: 'LAYOFF_MENTION',
      claimText: 'Acme is cutting 200 jobs',
      sector: 'technology',
      region: 'UK',
    })
    const { signals } = await createSignals([claim], new Map([[doc.id, doc]]))
    // A prior cluster of the same shape, just created.
    await prisma.signalCluster.create({
      data: {
        title: 'prior',
        clusterType: 'LAYOFF_SIGNAL',
        sector: 'technology',
        region: 'UK',
        strength: 0.6,
        confidence: 0.6,
        novelty: 0.9,
        explanation: 'prior shape',
      },
    })
    const { clusters } = await clusterSignals(signals)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].novelty).toBeLessThanOrEqual(0.25)
    expect(clusters[0].explanation).toContain('same shape last seen')
  })
})

describe('Stage 2: momentum persisted as a first-class event field', () => {
  beforeEach(resetDb)

  it('writes a recency-weighted momentum from the graph-event timeline onto the event', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Momentum test event',
        eventType: 'LAYOFF_SIGNAL',
        eventClass: 'RISK',
        summary: 's',
        severity: 0.5,
        probability: 0.5,
        confidence: 0.5,
        evidenceCount: 1,
        sourceDiversityScore: 1,
        signalStrength: 0.5,
        noveltyScore: 0.5,
        opportunityScore: 0.2,
        riskScore: 0.6,
        createdFromScanRunId: scanRun.id,
      },
    })
    const node = await prisma.graphNode.create({
      data: {
        nodeType: 'EVENT',
        refType: 'event',
        refId: event.id,
        title: 'Momentum test event',
        confidence: 0.5,
      },
    })
    const now = new Date()
    for (const [type, hoursAgo] of [
      ['CONFIDENCE_ROSE', 2],
      ['NEW_SOURCE', 6],
      ['SIGNAL_STRENGTHENED', 12],
    ] as const) {
      await prisma.graphEvent.create({
        data: {
          graphNodeId: node.id,
          eventCandidateId: event.id,
          eventType: type,
          description: 'test',
          occurredAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
        },
      })
    }

    const { updated } = await persistEventMomentum([event], now)
    expect(updated).toBe(1)
    const reloaded = await prisma.eventCandidate.findUniqueOrThrow({ where: { id: event.id } })
    // Three recent positive graph events → momentum well above neutral 0.5.
    expect(reloaded.momentumScore).toBeGreaterThan(0.6)
  })
})
