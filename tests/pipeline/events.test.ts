import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals } from '@/server/pipeline/cluster'
import { createEventCandidates } from '@/server/pipeline/events'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'
import type { Signal } from '@prisma/client'

async function seededSignal(
  name: string,
  overrides: Partial<Parameters<typeof makeSignal>[3]> = {},
): Promise<Signal> {
  const source = await makeSource({ name })
  const doc = await makeDocument(source.id)
  const claim = await makeClaim(doc.id)
  return makeSignal(claim.id, doc.id, source.id, overrides)
}

describe('createEventCandidates', () => {
  beforeEach(resetDb)

  it('creates a RISK event from a strong multi-source negative cluster, with feed items', async () => {
    const a = await seededSignal('Wire A', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const b = await seededSignal('Wire B', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events, feedItems, errors } = await createEventCandidates(clusters, scanRun.id)

    expect(errors).toHaveLength(0)
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.eventClass).toBe('RISK')
    expect(event.status).toBe('NEW')
    expect(event.primaryEntityId).toBeNull()
    expect(event.evidenceCount).toBe(2)
    expect(event.sourceDiversityScore).toBe(1)
    expect(event.riskScore).toBeGreaterThan(event.opportunityScore)
    expect(event.summary).toContain('source')
    expect(event.createdFromScanRunId).toBe(scanRun.id)

    const linkedCluster = await prisma.signalCluster.findUniqueOrThrow({ where: { id: clusters[0].id } })
    expect(linkedCluster.eventCandidateId).toBe(event.id)

    const types = feedItems.map((f) => f.feedType).sort()
    expect(types).toEqual(['INBOX', 'RISK_RADAR'])
  })

  it('creates an OPPORTUNITY event from a positive cluster', async () => {
    const a = await seededSignal('Wire A', {
      signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK', confidence: 0.8,
    })
    const b = await seededSignal('Wire B', {
      signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK', confidence: 0.8,
    })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events, feedItems } = await createEventCandidates(clusters, scanRun.id)
    expect(events[0].eventClass).toBe('OPPORTUNITY')
    expect(events[0].opportunityScore).toBeGreaterThan(events[0].riskScore)
    expect(feedItems.map((f) => f.feedType).sort()).toEqual(['INBOX', 'OPPORTUNITY_RADAR'])
  })

  it('creates a WATCH item (not a confident event) from a weak single-source cluster', async () => {
    const single = await seededSignal('Wire A', {
      signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65, confidence: 0.75, sector: 'energy', region: 'EU',
    })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([single])
    const { events, feedItems } = await createEventCandidates(clusters, scanRun.id)
    expect(events).toHaveLength(1)
    expect(events[0].eventClass).toBe('WATCH')
    expect(feedItems.some((f) => f.feedType === 'WATCHLIST')).toBe(true)
  })

  it('creates a sector-level event without any company selected', async () => {
    const a = await seededSignal('Wire A', { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const b = await seededSignal('Wire B', { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events } = await createEventCandidates(clusters, scanRun.id)
    expect(events[0].primaryEntityId).toBeNull()
    expect(events[0].affectedSector).toBe('public-sector')
  })
})
