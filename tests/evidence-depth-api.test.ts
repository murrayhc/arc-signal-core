import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runEvidenceDepth } from '@/server/evidence/depth-pipeline'
import { getClaimReliability, getEventEvidenceDepth } from '@/server/services/evidence-depth'
import { resetDb } from './helpers'
import { makeClaim, makeDocument, makeParsedDocument, makeSignal, makeSource } from './factories'

async function eventOverDocument(documentId: string, sourceId: string) {
  const claim = await makeClaim(documentId)
  const signal = await makeSignal(claim.id, documentId, sourceId)
  const scanRun = await prisma.scanRun.create({ data: {} })
  const event = await prisma.eventCandidate.create({
    data: {
      title: 'Voltcore layoffs',
      eventType: 'LAYOFF',
      eventClass: 'RISK',
      summary: 'Voltcore is cutting jobs.',
      severity: 0.6,
      probability: 0.6,
      confidence: 0.6,
      evidenceCount: 1,
      sourceDiversityScore: 0.5,
      signalStrength: 0.6,
      noveltyScore: 0.5,
      opportunityScore: 0.2,
      riskScore: 0.7,
      createdFromScanRunId: scanRun.id,
    },
  })
  const cluster = await prisma.signalCluster.create({
    data: { title: 'Layoff cluster', clusterType: 'LAYOFF_SIGNAL', strength: 0.6, confidence: 0.6, novelty: 0.5, explanation: 'x', eventCandidateId: event.id },
  })
  await prisma.signalClusterSignal.create({ data: { clusterId: cluster.id, signalId: signal.id } })
  return event
}

describe('evidence-depth read service', () => {
  beforeEach(resetDb)

  it('returns deep evidence joined to an event by document id', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    await runEvidenceDepth([parsed], new Map([[doc.id, doc]]), new Map([[source.id, source]]))
    const event = await eventOverDocument(doc.id, source.id)

    const depth = await getEventEvidenceDepth(event.id)
    expect(depth.hasDepth).toBe(true)
    if (depth.hasDepth) {
      expect(depth.claims.length).toBeGreaterThanOrEqual(1)
      expect(depth.atomicFacts.length).toBeGreaterThanOrEqual(1)
      expect(depth.queries.length).toBeGreaterThan(0)
      expect(depth.claims[0].reliabilityScore).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns hasDepth:false for an event whose documents have no atomic claims', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const event = await eventOverDocument(doc.id, source.id)
    const depth = await getEventEvidenceDepth(event.id)
    expect(depth.hasDepth).toBe(false)
  })

  it('getClaimReliability returns a score and a human reasoning summary', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    await runEvidenceDepth([parsed], new Map([[doc.id, doc]]), new Map([[source.id, source]]))
    const canonical = await prisma.canonicalClaim.findFirstOrThrow()
    const r = await getClaimReliability(canonical.id)
    expect(r).not.toBeNull()
    expect((r?.reasoningSummary ?? '').length).toBeGreaterThan(0)
    expect(r?.reliabilityScore).toBeGreaterThanOrEqual(0)
  })
})
