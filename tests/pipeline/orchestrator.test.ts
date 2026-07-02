import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('runFullScan', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
  })

  it('runs the full pipeline from fixture sources to dashboard feed items', async () => {
    const summary = await runFullScan()

    expect(summary.status).toBe('COMPLETED') // skips are warnings, not errors
    expect(summary.errors).toHaveLength(0)
    expect(summary.warnings).toHaveLength(1)
    expect(summary.warnings[0].stage).toBe('collect:skip')
    expect(summary.counts.sourcesScanned).toBe(2)
    expect(summary.counts.sourcesSkipped).toBe(1)
    expect(summary.counts.documentsFetched).toBe(8)
    expect(summary.counts.claimsExtracted).toBeGreaterThan(0)
    expect(summary.counts.signalsCreated).toBeGreaterThan(0)
    expect(summary.counts.clustersCreated).toBeGreaterThan(0)
    expect(summary.counts.eventCandidatesCreated).toBeGreaterThan(0)
    expect(summary.counts.dashboardFeedItemsCreated).toBeGreaterThan(0)

    // ScanRun row matches reality
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(scanRun.documentsFetched).toBe(await prisma.document.count())
    expect(scanRun.eventCandidatesCreated).toBe(await prisma.eventCandidate.count())
    expect(scanRun.completedAt).not.toBeNull()

    // The fixture corpora must produce both risk and opportunity events, all fixture-labelled
    const events = await prisma.eventCandidate.findMany()
    expect(events.some((e) => e.eventClass === 'RISK')).toBe(true)
    expect(events.some((e) => e.eventClass === 'OPPORTUNITY')).toBe(true)
    expect(events.every((e) => e.isFixture)).toBe(true)
    // No event required a company: entity resolution is deferred, so all are entity-free
    expect(events.every((e) => e.primaryEntityId === null)).toBe(true)

    // Evidence trail: every event has at least one cluster with signals→claims→documents
    const withTrail = await prisma.eventCandidate.findFirstOrThrow({
      include: { clusters: { include: { signals: { include: { signal: { include: { claim: true } } } } } }, riskOpportunities: true, dataGaps: true, triggerConditions: true },
    })
    expect(withTrail.clusters.length).toBeGreaterThan(0)
    expect(withTrail.clusters[0].signals.length).toBeGreaterThan(0)
    expect(withTrail.riskOpportunities.length).toBe(1)
    expect(withTrail.triggerConditions.length).toBeGreaterThan(0)

    // source health recorded for every active source
    expect(await prisma.sourceHealth.count()).toBe(3)
    const healthStatuses = (await prisma.sourceHealth.findMany()).map((h) => h.status).sort()
    expect(healthStatuses).toEqual(['HEALTHY', 'HEALTHY', 'UNSUPPORTED'])
  })

  it('completes even when one source fails, recording the error', async () => {
    await makeSource({ name: 'Broken RSS', accessMethod: 'RSS', url: 'http://127.0.0.1:9/nope.xml', isFixture: false })
    const summary = await runFullScan()
    expect(summary.status).toBe('COMPLETED_WITH_ERRORS')
    expect(summary.errors.some((e) => e.stage === 'collect')).toBe(true)
    expect(summary.counts.documentsFetched).toBe(8) // fixture docs still flowed through
    expect(summary.counts.eventCandidatesCreated).toBeGreaterThan(0)
  })

  it('is idempotent: a second scan creates no duplicate documents or signals', async () => {
    await runFullScan()
    const second = await runFullScan()
    expect(second.counts.documentsFetched).toBe(0)
    expect(second.counts.signalsCreated).toBe(0)
    expect(second.counts.eventCandidatesCreated).toBe(0)
    expect(second.counts.eventCandidatesUpdated).toBe(0)
    expect(await prisma.document.count()).toBe(8)
  })

  it('marks the ScanRun FAILED and still returns a summary when the orchestrator itself throws', async () => {
    const spy = vi.spyOn(prisma.source, 'findMany').mockRejectedValueOnce(new Error('db exploded'))
    const summary = await runFullScan()
    spy.mockRestore()
    expect(summary.status).toBe('FAILED')
    expect(summary.message).toContain('db exploded')
    const run = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(run.status).toBe('FAILED')
    expect(run.completedAt).not.toBeNull()
    expect(run.errorsJson).toContain('db exploded')
  })
})
