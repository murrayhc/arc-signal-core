import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import {
  getEventConfidenceSummary,
  getLastScanCounters,
  getRegionalPressure,
  getTrendSignals,
} from '@/server/services/command-centre'

async function seedScanRun() {
  return prisma.scanRun.create({ data: { status: 'COMPLETED' } })
}

function eventData(scanRunId: string, overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test event',
    eventType: 'SUPPLY_DISRUPTION',
    eventClass: 'RISK',
    summary: 'Test summary',
    severity: 0.5,
    probability: 0.5,
    confidence: 0.5,
    evidenceCount: 1,
    sourceDiversityScore: 0.5,
    signalStrength: 0.5,
    noveltyScore: 0.5,
    opportunityScore: 0.2,
    riskScore: 0.6,
    createdFromScanRunId: scanRunId,
    ...overrides,
  }
}

describe('command-centre service', () => {
  beforeEach(async () => {
    await resetDb()
  })

  describe('getTrendSignals', () => {
    it('returns clusters ordered by strength desc and never leaks raw rows', async () => {
      await prisma.signalCluster.createMany({
        data: [
          { title: 'Weak theme', clusterType: 'THEME', strength: 0.2, confidence: 0.4, novelty: 0.1, explanation: 'x' },
          { title: 'Strong theme', clusterType: 'THEME', strength: 0.9, confidence: 0.7, novelty: 0.8, explanation: 'x', sector: 'Energy' },
          { title: 'Mid theme', clusterType: 'SECTOR_PRESSURE', strength: 0.5, confidence: 0.5, novelty: 0.3, explanation: 'x' },
        ],
      })
      const trends = await getTrendSignals()
      expect(trends.map((t) => t.title)).toEqual(['Strong theme', 'Mid theme', 'Weak theme'])
      expect(trends[0].sector).toBe('Energy')
      expect(trends[0]).not.toHaveProperty('explanation')
      expect(trends[0]).not.toHaveProperty('eventCandidateId')
    })

    it('respects the limit', async () => {
      await prisma.signalCluster.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          title: `Cluster ${i}`,
          clusterType: 'THEME',
          strength: i / 10,
          confidence: 0.5,
          novelty: 0.5,
          explanation: 'x',
        })),
      })
      expect(await getTrendSignals(2)).toHaveLength(2)
    })

    it('returns [] when no clusters exist', async () => {
      expect(await getTrendSignals()).toEqual([])
    })
  })

  describe('getRegionalPressure', () => {
    it('groups non-dismissed events by region with correct means, null region as Unattributed', async () => {
      const scan = await seedScanRun()
      await prisma.eventCandidate.create({
        data: eventData(scan.id, { affectedRegion: 'EMEA', riskScore: 0.8, opportunityScore: 0.2, confidence: 0.6 }),
      })
      await prisma.eventCandidate.create({
        data: eventData(scan.id, { affectedRegion: 'EMEA', riskScore: 0.4, opportunityScore: 0.6, confidence: 0.8 }),
      })
      await prisma.eventCandidate.create({
        data: eventData(scan.id, { affectedRegion: null, riskScore: 0.5 }),
      })
      await prisma.eventCandidate.create({
        data: eventData(scan.id, { affectedRegion: 'APAC', status: 'DISMISSED' }),
      })

      const pressure = await getRegionalPressure()
      expect(pressure.map((p) => p.region)).toEqual(['EMEA', 'Unattributed'])

      const emea = pressure[0]
      expect(emea.eventCount).toBe(2)
      expect(emea.avgRisk).toBeCloseTo(0.6, 10)
      expect(emea.avgOpportunity).toBeCloseTo(0.4, 10)
      expect(emea.avgConfidence).toBeCloseTo(0.7, 10)
    })

    it('returns [] when no events exist', async () => {
      expect(await getRegionalPressure()).toEqual([])
    })
  })

  describe('getLastScanCounters', () => {
    it('returns the LATEST scan run counters', async () => {
      await prisma.scanRun.create({
        data: { status: 'COMPLETED', startedAt: new Date('2026-01-01'), signalsCreated: 3 },
      })
      await prisma.scanRun.create({
        data: {
          status: 'COMPLETED_WITH_ERRORS',
          startedAt: new Date('2026-06-01'),
          sourcesScanned: 4,
          documentsFetched: 12,
          claimsExtracted: 30,
          signalsCreated: 22,
          clustersCreated: 7,
          eventCandidatesCreated: 5,
          graphNodesUpserted: 88,
          graphEdgesUpserted: 120,
        },
      })
      const counters = await getLastScanCounters()
      expect(counters?.signalsCreated).toBe(22)
      expect(counters?.documentsFetched).toBe(12)
      expect(counters?.graphEdgesUpserted).toBe(120)
    })

    it('returns null when no scans exist', async () => {
      expect(await getLastScanCounters()).toBeNull()
    })
  })

  describe('getEventConfidenceSummary', () => {
    it('averages non-dismissed events and computes the high-confidence share', async () => {
      const scan = await seedScanRun()
      await prisma.eventCandidate.create({ data: eventData(scan.id, { confidence: 0.9 }) })
      await prisma.eventCandidate.create({ data: eventData(scan.id, { confidence: 0.5 }) })
      await prisma.eventCandidate.create({ data: eventData(scan.id, { confidence: 0.7 }) })
      await prisma.eventCandidate.create({
        data: eventData(scan.id, { confidence: 0.1, status: 'DISMISSED' }),
      })

      const summary = await getEventConfidenceSummary()
      expect(summary.eventCount).toBe(3)
      expect(summary.avgConfidence).toBeCloseTo(0.7, 10)
      expect(summary.highConfidenceShare).toBeCloseTo(2 / 3, 10)
    })

    it('is honest about emptiness: nulls, not zeros', async () => {
      const summary = await getEventConfidenceSummary()
      expect(summary).toEqual({ avgConfidence: null, highConfidenceShare: null, eventCount: 0 })
    })
  })
})
