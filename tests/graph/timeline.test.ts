import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { syncGraphForEvents } from '@/server/graph/builder'
import { recordGraphEvents, getEventReplay } from '@/server/graph/timeline'
import { resetDb } from '../helpers'

const NOW = new Date('2026-07-03T00:00:00Z')

/** Minimal EventCandidate + one source/document/claim/signal/cluster evidence chain, so the
 *  graph builder can project a real EVENT node with a SOURCE neighbour to diff against. */
async function seedEventWithEvidence(overrides: Partial<{ confidence: number; status: string }> = {}) {
  const source = await prisma.source.create({
    data: { name: `Timeline test source ${Math.random()}`, category: 'NEWS', accessMethod: 'FIXTURE', isFixture: true, collectorStatus: 'FUNCTIONAL' },
  })
  const document = await prisma.document.create({
    data: {
      sourceId: source.id,
      url: `https://fixture.archlight.local/${Math.random()}`,
      title: 'Test document',
      rawContent: 'Body',
      rawContentHash: `hash-${Math.random()}`,
      normalisedContentHash: `norm-${Math.random()}`,
      documentType: 'FIXTURE_ITEM',
      isFixture: true,
    },
  })
  const claim = await prisma.claim.create({
    data: {
      documentId: document.id,
      claimType: 'LAYOFF_MENTION',
      claimText: 'Test claim text.',
      extractionMethod: 'rule:v1:TEST',
      extractionConfidence: 0.8,
      credibilityScore: 0.7,
      isFixture: true,
    },
  })
  const signal = await prisma.signal.create({
    data: {
      claimId: claim.id,
      documentId: document.id,
      sourceId: source.id,
      signalType: 'LAYOFF_SIGNAL',
      signalDate: NOW,
      confidence: 0.8,
      strength: 0.7,
      direction: 'NEGATIVE',
      explanation: 'Test signal.',
      isFixture: true,
    },
  })
  const scanRun = await prisma.scanRun.create({ data: {} })
  const event = await prisma.eventCandidate.create({
    data: {
      title: 'Timeline test event',
      eventType: 'LAYOFF_SIGNAL',
      eventClass: 'RISK',
      summary: 'Summary',
      status: overrides.status ?? 'NEW',
      severity: 0.7,
      probability: 0.6,
      confidence: overrides.confidence ?? 0.5,
      affectedSector: 'technology',
      affectedRegion: 'UK',
      evidenceCount: 1,
      sourceDiversityScore: 0.5,
      signalStrength: 0.7,
      noveltyScore: 0.6,
      opportunityScore: 0.2,
      riskScore: 0.7,
      createdFromScanRunId: scanRun.id,
      isFixture: true,
    },
  })
  const cluster = await prisma.signalCluster.create({
    data: {
      title: 'Test cluster', clusterType: 'RISK', strength: 0.7, confidence: 0.7, novelty: 0.6,
      explanation: 'e', isFixture: true, eventCandidateId: event.id,
    },
  })
  await prisma.signalClusterSignal.create({ data: { clusterId: cluster.id, signalId: signal.id } })
  return { event, source, document, claim, signal }
}

describe('recordGraphEvents — two-scan sequence (integration)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('first scan records FIRST_DETECTED + a formation snapshot for a brand-new event', async () => {
    const { event } = await seedEventWithEvidence()
    await syncGraphForEvents([event], NOW)

    const result = await recordGraphEvents([event], NOW)
    expect(result.errors).toEqual([])
    expect(result.recorded).toBe(1)

    const graphNode = await prisma.graphNode.findUniqueOrThrow({ where: { refType_refId: { refType: 'event', refId: event.id } } })
    const rows = await prisma.graphEvent.findMany({ where: { graphNodeId: graphNode.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].eventType).toBe('FIRST_DETECTED')
    const meta = JSON.parse(rows[0].metadataJson)
    expect(meta).toMatchObject({ confidence: 0.5, status: 'NEW', sourceCount: 1, contradictionCount: 0, opportunityCount: 0 })

    const snapshots = await prisma.graphSnapshot.findMany({ where: { rootNodeId: graphNode.id } })
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].snapshotType).toBe('EVENT_FORMATION')
  })

  it('an unchanged event across a second scan records no new GraphEvent row', async () => {
    const { event } = await seedEventWithEvidence()
    await syncGraphForEvents([event], NOW)
    await recordGraphEvents([event], NOW)

    const later = new Date(NOW.getTime() + 60 * 60 * 1000)
    const result = await recordGraphEvents([event], later)
    expect(result.errors).toEqual([])
    expect(result.recorded).toBe(0)

    const graphNode = await prisma.graphNode.findUniqueOrThrow({ where: { refType_refId: { refType: 'event', refId: event.id } } })
    const rows = await prisma.graphEvent.findMany({ where: { graphNodeId: graphNode.id } })
    expect(rows).toHaveLength(1) // still just the FIRST_DETECTED row — no speculative/empty-diff row
  })

  it('a second scan that raises confidence and adds a source records CONFIDENCE_ROSE + NEW_SOURCE', async () => {
    const { event } = await seedEventWithEvidence({ confidence: 0.5 })
    await syncGraphForEvents([event], NOW)
    await recordGraphEvents([event], NOW)

    // Simulate scan 2: confidence rises beyond epsilon, and a second independent source is linked.
    const updatedEvent = await prisma.eventCandidate.update({ where: { id: event.id }, data: { confidence: 0.7 } })

    const source2 = await prisma.source.create({
      data: { name: `Second source ${Math.random()}`, category: 'NEWS', accessMethod: 'FIXTURE', isFixture: true, collectorStatus: 'FUNCTIONAL' },
    })
    const document2 = await prisma.document.create({
      data: {
        sourceId: source2.id, url: `https://fixture.archlight.local/${Math.random()}`, title: 'Second document',
        rawContent: 'Body2', rawContentHash: `hash2-${Math.random()}`, normalisedContentHash: `norm2-${Math.random()}`,
        documentType: 'FIXTURE_ITEM', isFixture: true,
      },
    })
    const claim2 = await prisma.claim.create({
      data: {
        documentId: document2.id, claimType: 'LAYOFF_MENTION', claimText: 'Second claim.',
        extractionMethod: 'rule:v1:TEST', extractionConfidence: 0.8, credibilityScore: 0.7, isFixture: true,
      },
    })
    const signal2 = await prisma.signal.create({
      data: {
        claimId: claim2.id, documentId: document2.id, sourceId: source2.id, signalType: 'LAYOFF_SIGNAL',
        signalDate: NOW, confidence: 0.8, strength: 0.7, direction: 'NEGATIVE', explanation: 'Second signal.', isFixture: true,
      },
    })
    const cluster2 = await prisma.signalCluster.create({
      data: {
        title: 'Second cluster', clusterType: 'RISK', strength: 0.7, confidence: 0.7, novelty: 0.6,
        explanation: 'e2', isFixture: true, eventCandidateId: event.id,
      },
    })
    await prisma.signalClusterSignal.create({ data: { clusterId: cluster2.id, signalId: signal2.id } })

    await syncGraphForEvents([updatedEvent], NOW)
    const later = new Date(NOW.getTime() + 60 * 60 * 1000)
    const result = await recordGraphEvents([updatedEvent], later)
    expect(result.errors).toEqual([])
    expect(result.recorded).toBe(2)

    const graphNode = await prisma.graphNode.findUniqueOrThrow({ where: { refType_refId: { refType: 'event', refId: event.id } } })
    const rows = await prisma.graphEvent.findMany({ where: { graphNodeId: graphNode.id }, orderBy: { occurredAt: 'asc' } })
    expect(rows).toHaveLength(3) // FIRST_DETECTED + CONFIDENCE_ROSE + NEW_SOURCE
    const types = rows.map((r) => r.eventType).sort()
    expect(types).toEqual(['CONFIDENCE_ROSE', 'FIRST_DETECTED', 'NEW_SOURCE'])

    const latestRows = rows.filter((r) => r.eventType !== 'FIRST_DETECTED')
    for (const row of latestRows) {
      const meta = JSON.parse(row.metadataJson)
      expect(meta.confidence).toBe(0.7)
      expect(meta.sourceCount).toBe(2)
    }
  })

  it('a status transition to ESCALATED records EVENT_ESCALATED + a CURRENT_STATE snapshot', async () => {
    const { event } = await seedEventWithEvidence({ status: 'NEW' })
    await syncGraphForEvents([event], NOW)
    await recordGraphEvents([event], NOW)

    const escalated = await prisma.eventCandidate.update({ where: { id: event.id }, data: { status: 'ESCALATED' } })
    await syncGraphForEvents([escalated], NOW)
    const later = new Date(NOW.getTime() + 60 * 60 * 1000)
    const result = await recordGraphEvents([escalated], later)
    expect(result.recorded).toBe(1)

    const graphNode = await prisma.graphNode.findUniqueOrThrow({ where: { refType_refId: { refType: 'event', refId: event.id } } })
    const rows = await prisma.graphEvent.findMany({ where: { graphNodeId: graphNode.id, eventType: 'EVENT_ESCALATED' } })
    expect(rows).toHaveLength(1)

    const snapshots = await prisma.graphSnapshot.findMany({ where: { rootNodeId: graphNode.id, snapshotType: 'CURRENT_STATE' } })
    expect(snapshots).toHaveLength(1)
  })

  it('never records a synthetic/unknown eventType — every row is one of the 10 GRAPH_EVENT_TYPES', async () => {
    const { event } = await seedEventWithEvidence()
    await syncGraphForEvents([event], NOW)
    await recordGraphEvents([event], NOW)

    const updated = await prisma.eventCandidate.update({ where: { id: event.id }, data: { confidence: 0.9, status: 'ESCALATED' } })
    await syncGraphForEvents([updated], NOW)
    const later = new Date(NOW.getTime() + 60 * 60 * 1000)
    await recordGraphEvents([updated], later)

    const { GRAPH_EVENT_TYPES } = await import('@/shared/enums')
    const rows = await prisma.graphEvent.findMany()
    for (const row of rows) {
      expect(GRAPH_EVENT_TYPES).toContain(row.eventType)
    }
  })

  it('does not fail (throws no error) for an event with no synced GraphNode — collects a per-event error instead', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const orphan = await prisma.eventCandidate.create({
      data: {
        title: 'Orphan event (never graph-synced)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.5, probability: 0.5, confidence: 0.5, evidenceCount: 0, sourceDiversityScore: 0,
        signalStrength: 0.5, noveltyScore: 0.5, opportunityScore: 0, riskScore: 0.5,
        createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    const result = await recordGraphEvents([orphan], NOW)
    expect(result.recorded).toBe(0)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].stage).toContain('graph:timeline')
  })
})

describe('getEventReplay', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('returns the ordered timeline + snapshots + computed scores for a scanned event', async () => {
    const { event } = await seedEventWithEvidence({ confidence: 0.5 })
    await syncGraphForEvents([event], NOW)
    await recordGraphEvents([event], NOW)

    const updated = await prisma.eventCandidate.update({ where: { id: event.id }, data: { confidence: 0.7 } })
    await syncGraphForEvents([updated], NOW)
    const later = new Date(NOW.getTime() + 60 * 60 * 1000)
    await recordGraphEvents([updated], later)

    const replay = await getEventReplay(event.id)
    expect(replay).not.toBeNull()
    expect(replay!.timeline.length).toBeGreaterThanOrEqual(2)
    // ordered ascending by occurredAt
    for (let i = 1; i < replay!.timeline.length; i++) {
      expect(replay!.timeline[i].occurredAt.getTime()).toBeGreaterThanOrEqual(replay!.timeline[i - 1].occurredAt.getTime())
    }
    expect(replay!.timeline[0].eventType).toBe('FIRST_DETECTED')
    expect(replay!.snapshots.length).toBeGreaterThanOrEqual(1)
    expect(replay!.momentum).toBeGreaterThanOrEqual(0)
    expect(replay!.momentum).toBeLessThanOrEqual(1)
    expect(replay!.confidenceDecay).toBeGreaterThanOrEqual(0)
    expect(replay!.confidenceDecay).toBeLessThanOrEqual(1)
    expect(replay!.freshness).toBeGreaterThanOrEqual(0)
    expect(replay!.freshness).toBeLessThanOrEqual(1)
  })

  it('returns null for an event with no GraphNode / no timeline', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Never synced', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.5, probability: 0.5, confidence: 0.5, evidenceCount: 0, sourceDiversityScore: 0,
        signalStrength: 0.5, noveltyScore: 0.5, opportunityScore: 0, riskScore: 0.5,
        createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    expect(await getEventReplay(event.id)).toBeNull()
  })

  it('returns null for an unknown eventCandidateId', async () => {
    expect(await getEventReplay('does-not-exist')).toBeNull()
  })
})
