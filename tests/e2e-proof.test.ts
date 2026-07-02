import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import type { ScanSummary } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { getDashboardData } from '@/server/services/dashboard'
import { getEventDetail } from '@/server/services/events'
import { resetDb } from './helpers'

describe('AUTONOMOUS RADAR PROOF: scan → rows at every stage → dashboard → interrogation', () => {
  let summary: ScanSummary

  beforeAll(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    summary = await runFullScan()
  })

  it('creates rows at every pipeline stage', async () => {
    expect(await prisma.document.count()).toBeGreaterThan(0)
    expect(await prisma.parsedDocument.count()).toBeGreaterThan(0)
    expect(await prisma.claim.count()).toBeGreaterThan(0)
    expect(await prisma.signal.count()).toBeGreaterThan(0)
    expect(await prisma.signalCluster.count()).toBeGreaterThan(0)
    expect(await prisma.eventCandidate.count()).toBeGreaterThan(0)
    expect(await prisma.riskOpportunity.count()).toBeGreaterThan(0)
    expect(await prisma.dashboardFeedItem.count()).toBeGreaterThan(0)
    expect(await prisma.dataGap.count()).toBeGreaterThan(0)
    expect(await prisma.triggerCondition.count()).toBeGreaterThan(0)
  })

  it('records accurate counters on the ScanRun', async () => {
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(scanRun.documentsFetched).toBe(await prisma.document.count())
    expect(scanRun.claimsExtracted).toBe(await prisma.claim.count())
    expect(scanRun.signalsCreated).toBe(await prisma.signal.count())
    expect(scanRun.clustersCreated).toBe(await prisma.signalCluster.count())
    expect(scanRun.eventCandidatesCreated).toBe(await prisma.eventCandidate.count())
    expect(scanRun.dashboardFeedItemsCreated).toBe(await prisma.dashboardFeedItem.count())
    expect(scanRun.sourcesSkipped).toBe(1) // the seeded UNSUPPORTED source
    expect(scanRun.completedAt).not.toBeNull()
  })

  it('surfaces scan-created events on the dashboard feed — risk AND opportunity', async () => {
    const dashboard = await getDashboardData()
    expect(dashboard.riskRadar.length).toBeGreaterThan(0)
    expect(dashboard.opportunityRadar.length).toBeGreaterThan(0)
    expect(dashboard.inbox.length).toBe(await prisma.eventCandidate.count())
    // every card is honestly labelled as fixture-derived
    expect([...dashboard.riskRadar, ...dashboard.opportunityRadar].every((c) => c.isFixture)).toBe(true)
  })

  it('opens an event with no manually selected company and shows the full interrogation payload', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({ where: { primaryEntityId: null } })
    const detail = await getEventDetail(event.id)
    expect(detail).not.toBeNull()
    expect(detail!.event.primaryEntity).toBeNull()
    expect(detail!.evidence.length).toBeGreaterThan(0)           // evidence
    expect(detail!.event.confidence).toBeGreaterThan(0)          // confidence
    expect(detail!.event.sourceDiversityScore).toBeGreaterThan(0) // source diversity
    expect(detail!.dataGaps.length).toBeGreaterThan(0)           // data gaps
    expect(detail!.riskOpportunities[0].riskLogic.length).toBeGreaterThan(0)        // risk logic
    expect(detail!.riskOpportunities[0].opportunityLogic.length).toBeGreaterThan(0) // opportunity logic
  })

  it('preserves the full evidence trail from event back to source', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({
      include: {
        clusters: {
          include: {
            signals: {
              include: {
                signal: { include: { claim: true, document: { include: { source: true } } } },
              },
            },
          },
        },
      },
    })
    const signal = event.clusters[0].signals[0].signal
    expect(signal.claim.documentId).toBe(signal.document.id)
    expect(signal.document.source.name).toContain('Fixture Wire')
  })
})
