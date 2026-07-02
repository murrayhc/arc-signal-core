import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals } from '@/server/pipeline/cluster'
import { createEventCandidates } from '@/server/pipeline/events'
import { generateGapsAndTriggers } from '@/server/pipeline/gaps'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'

async function eventFromSignals(signalSpecs: { sourceName: string; overrides?: Record<string, unknown> }[]) {
  const signals = []
  for (const spec of signalSpecs) {
    const source = await makeSource({ name: spec.sourceName })
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    signals.push(await makeSignal(claim.id, doc.id, source.id, spec.overrides ?? {}))
  }
  const scanRun = await prisma.scanRun.create({ data: {} })
  const { clusters } = await clusterSignals(signals)
  const { events } = await createEventCandidates(clusters, scanRun.id)
  return events[0]
}

describe('generateGapsAndTriggers', () => {
  beforeEach(resetDb)

  it('creates a single-source gap when all evidence comes from one source', async () => {
    const event = await eventFromSignals([{ sourceName: 'Only Wire', overrides: { strength: 0.7 } }])
    const { dataGaps } = await generateGapsAndTriggers([event])
    expect(dataGaps.some((g) => g.title === 'Single-source support')).toBe(true)
    const gap = dataGaps.find((g) => g.title === 'Single-source support')!
    expect(gap.impactOnConfidence).toBe(-0.15)
    expect(gap.severity).toBe('HIGH')
  })

  it('creates a staleness gap for old evidence', async () => {
    const event = await eventFromSignals([
      { sourceName: 'Wire A', overrides: { signalDate: new Date('2026-05-01T00:00:00Z') } },
      { sourceName: 'Wire B', overrides: { signalDate: new Date('2026-05-02T00:00:00Z') } },
    ])
    const { dataGaps } = await generateGapsAndTriggers([event], new Date('2026-07-02T00:00:00Z'))
    expect(dataGaps.some((g) => g.title === 'Evidence may be stale')).toBe(true)
  })

  it('creates trigger conditions from the event type template', async () => {
    const event = await eventFromSignals([
      { sourceName: 'Wire A' },
      { sourceName: 'Wire B' },
    ])
    const { triggerConditions } = await generateGapsAndTriggers([event])
    expect(triggerConditions.length).toBeGreaterThanOrEqual(2)
    expect(triggerConditions.some((t) => t.direction === 'RAISES')).toBe(true)
    expect(triggerConditions.some((t) => t.direction === 'LOWERS')).toBe(true)
    expect(triggerConditions.every((t) => t.eventCandidateId === event.id)).toBe(true)
  })

  it('skips events with no member signals, recording an error instead of inventing gaps', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const orphan = await prisma.eventCandidate.create({
      data: {
        title: 'Orphan event', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 't',
        severity: 0.5, probability: 0.5, confidence: 0.5, evidenceCount: 0,
        sourceDiversityScore: 0, signalStrength: 0.5, noveltyScore: 0.5,
        opportunityScore: 0.2, riskScore: 0.5, createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    const { dataGaps, triggerConditions, errors } = await generateGapsAndTriggers([orphan])
    expect(dataGaps).toHaveLength(0)
    expect(triggerConditions).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('no member signals')
  })
})
