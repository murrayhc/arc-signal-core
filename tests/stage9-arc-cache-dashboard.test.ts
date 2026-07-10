import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { getEventArc } from '@/server/services/graph'
import { getDashboardData } from '@/server/services/dashboard'
import { resetDb } from './helpers'

describe('Stage 9: evidence-arc caching (no write-on-GET)', () => {
  beforeEach(resetDb)

  it('warms arcs at scan time and serves reads from cache without rebuilding', async () => {
    await runSeed({ includeLive: false })
    const scan = await runFullScan()
    expect(scan.counts.eventCandidatesCreated).toBeGreaterThan(0)

    const event = await prisma.eventCandidate.findFirstOrThrow()
    // Arc already built by the scan (cache is warm).
    const arcCountAfterScan = await prisma.evidenceArc.count()
    expect(arcCountAfterScan).toBeGreaterThan(0)

    const firstRead = await getEventArc(event.id)
    expect(firstRead).not.toBeNull()

    // Reading again does NOT delete+recreate arc rows (the old write-on-GET):
    // the arc id and row count are stable across reads.
    const arcRow = await prisma.evidenceArc.findFirstOrThrow({ where: { rootNodeId: firstRead!.arc.rootNodeId } })
    const secondRead = await getEventArc(event.id)
    const arcRowAfter = await prisma.evidenceArc.findFirstOrThrow({ where: { rootNodeId: firstRead!.arc.rootNodeId } })
    expect(secondRead!.arc.id).toBe(firstRead!.arc.id)
    expect(arcRowAfter.id).toBe(arcRow.id) // same row, not recreated
    expect(arcRowAfter.createdAt.getTime()).toBe(arcRow.createdAt.getTime())
    expect(await prisma.evidenceArc.count()).toBe(arcCountAfterScan) // no growth
  })

  it('rebuilds when the graph node has changed since the cached arc (staleness)', async () => {
    await runSeed({ includeLive: false })
    await runFullScan()
    const event = await prisma.eventCandidate.findFirstOrThrow()
    const first = await getEventArc(event.id)
    expect(first).not.toBeNull()

    // Touch the graph node so it is newer than the cached arc → next read rebuilds.
    const node = await prisma.graphNode.findFirstOrThrow({ where: { refType: 'event', refId: event.id } })
    await new Promise((r) => setTimeout(r, 5))
    await prisma.graphNode.update({ where: { id: node.id }, data: { impactScore: node.impactScore + 0.01 } })

    const second = await getEventArc(event.id)
    expect(second).not.toBeNull()
    // A rebuild replaced the row (delete+recreate in buildArc), so the id changes.
    expect(second!.arc.id).not.toBe(first!.arc.id)
  })
})

describe('Stage 9: dashboard truth', () => {
  beforeEach(resetDb)

  it('reports source-category coverage and the pending-review count', async () => {
    await runSeed({ includeLive: true }) // the live source pack spans categories
    // A pending review item to surface.
    await prisma.reviewItem.create({
      data: {
        itemType: 'MANIPULATION_ALERT',
        subjectKind: 'event',
        subjectId: 'e',
        dedupeKey: 'demo:x',
        title: 't',
        reason: 'r',
        status: 'PENDING',
      },
    })

    const data = await getDashboardData()
    const categories = data.sourceCategories.map((c) => c.category)
    // Multiple live source categories are represented — not one lighthouse.
    expect(categories).toContain('NEWS')
    expect(categories).toContain('REGULATOR')
    expect(categories).toContain('PROCUREMENT')
    expect(data.sourceCategories.length).toBeGreaterThanOrEqual(4)
    // Fixture sources are excluded from the live coverage summary.
    expect(categories).not.toContain('FIXTURE')

    expect(data.pendingReviewCount).toBe(1)
  })
})
