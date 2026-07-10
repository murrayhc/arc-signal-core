import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { freezePredictions } from '@/server/outcome/ledger'
import { applyReviewVerdict, computeLeadTimeDays, evaluateOpenPredictions } from '@/server/outcome/resolution'
import { synthesiseContext } from '@/server/consequence/context'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { resetDb } from './helpers'
import { makeDocument, makeEventGraph, makeLineage, makeSource } from './factories'
import { randomUUID } from 'node:crypto'

const NOW = new Date('2026-07-10T12:00:00Z')
const DAY_MS = 86_400_000
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS)

/** Event with scenarios + frozen predictions; returns event + its canonical ids.
 *  Distinct body text per call — identical sentences canonicalise into ONE
 *  shared claim across events, which cross-contaminates lineage. */
async function frozenEvent(sourceCategory = 'NEWS', body = 'The company is cutting 500 jobs in Manchester.') {
  const { event, source } = await makeEventGraph(body)
  if (sourceCategory !== 'NEWS') {
    await prisma.source.update({ where: { id: source.id }, data: { category: sourceCategory } })
  }
  await synthesiseContext(event.id)
  await freezePredictions([event], NOW)
  const canonicalIds = await canonicalIdsForEvent(event.id)
  expect(canonicalIds.length).toBeGreaterThan(0)
  return { event, source, canonicalIds }
}

/** Adds a NEW post-prediction corroborating publisher (own independence group). */
async function corroborate(canonicalId: string, category: string, publishedAt: Date) {
  const s = await makeSource({ category, name: `Corroborator ${randomUUID()}` })
  const d = await makeDocument(s.id)
  await makeLineage(canonicalId, s.id, d.id, { relationToOrigin: 'INDEPENDENT_SUPPORT', publishedAt })
  return s
}

const eventPrediction = (eventId: string) =>
  prisma.outcomePrediction.findFirstOrThrow({ where: { eventCandidateId: eventId, subjectKind: 'EVENT' } })

const scenarioPredictions = (eventId: string) =>
  prisma.outcomePrediction.findMany({ where: { eventCandidateId: eventId, subjectKind: 'SCENARIO' } })

describe('outcome resolution (Stage 11)', () => {
  beforeEach(resetDb)

  it('rule 1a: new primary/official corroboration resolves HAPPENED with Brier + rationale', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'REGULATOR', days(2))
    const res = await evaluateOpenPredictions(days(3))
    expect(res.errors).toEqual([])
    const p = await eventPrediction(event.id)
    expect(p.status).toBe('RESOLVED')
    expect(p.outcome).toBe('HAPPENED')
    expect(p.resolvedBy).toBe('AUTO_EVIDENCE')
    expect(p.brierFirst).toBeCloseTo((1 - p.predictedProbability) ** 2, 10)
    expect(p.resolutionRationale).toMatch(/primary|official/i)
    expect(res.resolved).toBeGreaterThanOrEqual(1)
  })

  it('rule 1b: two new independent publisher groups with zero contradictions resolve HAPPENED', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'NEWS', days(1))
    await corroborate(canonicalIds[0], 'NEWS', days(2))
    await evaluateOpenPredictions(days(3))
    const p = await eventPrediction(event.id)
    expect(p.outcome).toBe('HAPPENED')
    expect(p.resolvedBy).toBe('AUTO_EVIDENCE')
  })

  it('one new group alone is not enough pre-deadline — prediction stays OPEN', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'NEWS', days(1))
    await evaluateOpenPredictions(days(2))
    const p = await eventPrediction(event.id)
    expect(p.status).toBe('OPEN')
  })

  it('rule 2: formally CONTRADICTED evidence resolves DID_NOT_HAPPEN and grades REVERSAL immediately', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await prisma.canonicalClaim.update({
      where: { id: canonicalIds[0] },
      data: { factualityLabel: 'CONTRADICTED', contradictionCount: 2 },
    })
    await evaluateOpenPredictions(days(2))
    const p = await eventPrediction(event.id)
    expect(p.outcome).toBe('DID_NOT_HAPPEN')
    expect(p.resolvedBy).toBe('AUTO_EVIDENCE')
    expect(p.observedPath).toBe('REVERSED')
    const scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'RESOLVED')).toBe(true)
    expect(scenarios.find((s) => s.scenarioType === 'REVERSAL')?.outcome).toBe('HAPPENED')
    expect(scenarios.find((s) => s.scenarioType === 'BASE_CASE')?.outcome).toBe('DID_NOT_HAPPEN')
  })

  it('rule 4: quiet deadline resolves DID_NOT_HAPPEN with path NONE, all scenarios false', async () => {
    const { event } = await frozenEvent()
    await evaluateOpenPredictions(days(98)) // past the 90d default + grace-free deadline
    const p = await eventPrediction(event.id)
    expect(p.outcome).toBe('DID_NOT_HAPPEN')
    expect(p.resolvedBy).toBe('AUTO_DEADLINE')
    expect(p.observedPath).toBe('NONE')
    expect(p.brierFirst).toBeCloseTo(p.predictedProbability ** 2, 10)
    const scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'RESOLVED' && s.outcome === 'DID_NOT_HAPPEN')).toBe(true)
  })

  it('rule 5: mixed evidence at deadline goes to PENDING_REVIEW with a review item', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'NEWS', days(1))
    await prisma.canonicalClaim.update({ where: { id: canonicalIds[0] }, data: { contradictionCount: 1 } })
    // pre-deadline: mixed → wait
    await evaluateOpenPredictions(days(2))
    expect((await eventPrediction(event.id)).status).toBe('OPEN')
    // at deadline: mixed → review
    const res = await evaluateOpenPredictions(days(98))
    expect(res.pendingReview).toBeGreaterThanOrEqual(1)
    const p = await eventPrediction(event.id)
    expect(p.status).toBe('PENDING_REVIEW')
    const item = await prisma.reviewItem.findFirst({ where: { itemType: 'PREDICTION_RESOLUTION' } })
    expect(item).not.toBeNull()
    expect(item?.subjectId).toBe(p.id)
    // scenarios wait for the verdict
    const scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'OPEN')).toBe(true)
  })

  it('scenario timing: early HAPPENED leaves scenarios OPEN until deadline; spread grades WIDENED', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'REGULATOR', days(2))
    await evaluateOpenPredictions(days(3))
    expect((await eventPrediction(event.id)).outcome).toBe('HAPPENED')
    let scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'OPEN')).toBe(true) // containment unknowable yet

    // two new affected entities post-prediction → WIDENED
    for (const name of ['Voltcore Ltd', 'Gridwave Plc']) {
      const entity = await prisma.entity.create({ data: { name: `${name} ${randomUUID()}` } })
      await prisma.eventCandidateEntity.create({ data: { eventCandidateId: event.id, entityId: entity.id } })
    }
    await evaluateOpenPredictions(days(98))
    scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'RESOLVED')).toBe(true)
    expect(scenarios.find((s) => s.scenarioType === 'ACCELERATED')?.outcome).toBe('HAPPENED')
    expect(scenarios.find((s) => s.scenarioType === 'CONSERVATIVE')?.outcome).toBe('DID_NOT_HAPPEN')
    expect((await eventPrediction(event.id)).observedPath).toBe('WIDENED')
  })

  it('review verdicts: HAPPENED resolves via REVIEW and grades scenarios; NEEDS_MORE_EVIDENCE reopens', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'NEWS', days(1))
    await prisma.canonicalClaim.update({ where: { id: canonicalIds[0] }, data: { contradictionCount: 1 } })
    await evaluateOpenPredictions(days(98))
    const pending = await eventPrediction(event.id)
    expect(pending.status).toBe('PENDING_REVIEW')

    // NEEDS_MORE_EVIDENCE → back to OPEN, deadline extended
    await applyReviewVerdict(pending.id, 'NEEDS_MORE_EVIDENCE', 'want a primary source', days(98))
    const reopened = await eventPrediction(event.id)
    expect(reopened.status).toBe('OPEN')
    expect(reopened.deadline.getTime()).toBe(pending.deadline.getTime() + 30 * DAY_MS)

    // Back to review, then a human verdict lands
    await evaluateOpenPredictions(days(130))
    const again = await eventPrediction(event.id)
    expect(again.status).toBe('PENDING_REVIEW')
    await applyReviewVerdict(again.id, 'HAPPENED', 'confirmed by companies house filing', days(130))
    const resolved = await eventPrediction(event.id)
    expect(resolved.status).toBe('RESOLVED')
    expect(resolved.outcome).toBe('HAPPENED')
    expect(resolvedBy(resolved)).toBe('REVIEW')
    const scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.status === 'RESOLVED')).toBe(true)
    // 1 new group on 1 distinct day, no spread → CONTAINED
    expect(scenarios.find((s) => s.scenarioType === 'CONSERVATIVE')?.outcome).toBe('HAPPENED')
  })

  it('review verdict UNRESOLVABLE excludes from grading (no Brier)', async () => {
    const { event, canonicalIds } = await frozenEvent()
    await corroborate(canonicalIds[0], 'NEWS', days(1))
    await prisma.canonicalClaim.update({ where: { id: canonicalIds[0] }, data: { contradictionCount: 1 } })
    await evaluateOpenPredictions(days(98))
    const pending = await eventPrediction(event.id)
    await applyReviewVerdict(pending.id, 'UNRESOLVABLE', 'duplicate of another event', days(99))
    const p = await eventPrediction(event.id)
    expect(p.outcome).toBe('UNRESOLVABLE')
    expect(p.brierFirst).toBeNull()
    const scenarios = await scenarioPredictions(event.id)
    expect(scenarios.every((s) => s.outcome === 'UNRESOLVABLE' && s.brierFirst === null)).toBe(true)
  })

  it('dismissed events route to review immediately', async () => {
    const { event } = await frozenEvent()
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { status: 'DISMISSED' } })
    await evaluateOpenPredictions(days(2))
    expect((await eventPrediction(event.id)).status).toBe('PENDING_REVIEW')
  })

  it('lead time: regulator-first detection beats mainstream by 4 days', async () => {
    const { event, canonicalIds } = await frozenEvent('REGULATOR')
    // set the origin lineage date explicitly
    await prisma.claimLineage.updateMany({
      where: { canonicalClaimId: { in: canonicalIds } },
      data: { publishedAt: NOW },
    })
    await corroborate(canonicalIds[0], 'NEWS', days(4))
    const lead = await computeLeadTimeDays(event.id, event.firstDetectedAt)
    expect(lead).not.toBeNull()
    expect(Math.abs(lead! - 4)).toBeLessThan(0.6) // firstDetectedAt ≈ NOW (test-run clock skew)
  })

  it('lead time: mainstream-sourced detection is 0; no mainstream coverage is null', async () => {
    const { event, canonicalIds } = await frozenEvent() // NEWS origin
    await prisma.claimLineage.updateMany({
      where: { canonicalClaimId: { in: canonicalIds } },
      data: { publishedAt: NOW },
    })
    expect(await computeLeadTimeDays(event.id, event.firstDetectedAt)).toBe(0)

    const other = await frozenEvent('REGULATOR', 'The watchdog opened an investigation into Gridwave Plc pricing.')
    await prisma.claimLineage.updateMany({
      where: { canonicalClaimId: { in: other.canonicalIds } },
      data: { publishedAt: NOW },
    })
    expect(await computeLeadTimeDays(other.event.id, other.event.firstDetectedAt)).toBeNull()
  })
})

function resolvedBy(p: { resolvedBy: string | null }): string | null {
  return p.resolvedBy
}
