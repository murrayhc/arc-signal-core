import { prisma } from '@/server/db'
import { assessReliability } from '@/server/evidence/reliability'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { SCENARIO_TYPES } from '@/shared/enums'
import { DEADLINE_GRACE_DAYS, DEFAULT_HORIZON_DAYS } from './constants'
import type { OutcomeError, PredictionBaseline } from './types'

/**
 * The prediction ledger — immutable receipts for what Archlight predicted,
 * at what probability, by when. Frozen the moment an event first exists;
 * scenario rows survive the consequence layer's per-scan wipe-and-rebuild
 * because the ledger never re-reads them after freezing.
 */

const DAY_MS = 86_400_000
const GRADEABLE_SCENARIOS = SCENARIO_TYPES.filter((t) => t !== 'LOW_CONFIDENCE')

export function dedupeKeyFor(eventId: string, subjectKind: 'EVENT' | 'SCENARIO', scenarioType?: string | null): string {
  return `${eventId}:${subjectKind}:${scenarioType ?? '-'}`
}

export function deadlineFor(event: { firstDetectedAt: Date; timeWindowEnd: Date | null }): Date {
  if (event.timeWindowEnd) return new Date(event.timeWindowEnd.getTime() + DEADLINE_GRACE_DAYS * DAY_MS)
  return new Date(event.firstDetectedAt.getTime() + DEFAULT_HORIZON_DAYS * DAY_MS)
}

export const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Snapshot of the evidence state at freeze time. Group identity follows the
 *  reliability engine: `source.independenceGroup ?? source.id` — one voice per
 *  publisher group, never per source row. */
export async function buildBaseline(eventId: string, canonicalIds: string[]): Promise<PredictionBaseline> {
  const lineage = canonicalIds.length
    ? await prisma.claimLineage.findMany({ where: { canonicalClaimId: { in: canonicalIds } } })
    : []
  const sourceIds = [...new Set(lineage.map((l) => l.sourceId))]
  const sources = sourceIds.length ? await prisma.source.findMany({ where: { id: { in: sourceIds } } }) : []
  const groupOf = new Map(sources.map((s) => [s.id, s.independenceGroup ?? s.id]))
  const support = lineage.filter(
    (l) => l.relationToOrigin === 'ORIGIN_CANDIDATE' || l.relationToOrigin === 'INDEPENDENT_SUPPORT',
  )
  const canonicals = canonicalIds.length
    ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } })
    : []
  const entities = await prisma.eventCandidateEntity.findMany({ where: { eventCandidateId: eventId } })
  return {
    groups: [...new Set(support.map((l) => groupOf.get(l.sourceId) ?? l.sourceId))],
    entityIds: entities.map((e) => e.entityId),
    contradictionCount: canonicals.reduce((n, c) => n + c.contradictionCount, 0),
    supportDays: [...new Set(support.map((l) => utcDay(l.publishedAt ?? l.createdAt)))],
  }
}

/** Mean reliability dimensions across the event's canonical claims at freeze
 *  time — the frozen input the weight learner backtests against. Read-only. */
async function buildDimensionsSnapshot(canonicalIds: string[], now: Date): Promise<Record<string, number>> {
  const sums: Record<string, number> = {}
  let n = 0
  for (const id of canonicalIds) {
    try {
      const { result } = await assessReliability(id, { now })
      for (const [k, v] of Object.entries(result.dimensions)) sums[k] = (sums[k] ?? 0) + v
      n++
    } catch {
      // claim disappeared mid-scan — skip; the snapshot is a best-effort mean
    }
  }
  if (n === 0) return {}
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / n]))
}

/** Freezes the immutable prediction receipts for events that don't have them
 *  yet: 1 EVENT-level + 4 gradeable SCENARIO-level rows (LOW_CONFIDENCE is an
 *  epistemic statement, not a falsifiable prediction — never graded).
 *  Idempotent on dedupeKey; existing rows are NEVER updated here. */
export async function freezePredictions(
  events: { id: string }[],
  now: Date,
): Promise<{ created: number; errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  let created = 0
  for (const { id } of events) {
    try {
      const event = await prisma.eventCandidate.findUnique({ where: { id } })
      if (!event) continue
      const existing = await prisma.outcomePrediction.findUnique({ where: { dedupeKey: dedupeKeyFor(id, 'EVENT') } })
      if (existing) continue // receipts already frozen for this event

      const canonicalIds = await canonicalIdsForEvent(id)
      const baseline = await buildBaseline(id, canonicalIds)
      const dimensions = await buildDimensionsSnapshot(canonicalIds, now)
      const deadline = deadlineFor(event)
      const deadlineDay = utcDay(deadline)

      const confirming: string[] = []
      const weakening: string[] = []
      const triggers = await prisma.triggerCondition.findMany({ where: { eventCandidateId: id } })
      for (const t of triggers) (t.direction === 'RAISES' ? confirming : weakening).push(t.conditionText)

      await prisma.outcomePrediction.create({
        data: {
          subjectKind: 'EVENT',
          eventCandidateId: id,
          dedupeKey: dedupeKeyFor(id, 'EVENT'),
          predictionText: `Event "${event.title}" (${event.eventType}) materialises by ${deadlineDay}`,
          predictedProbability: event.probability,
          finalProbability: event.probability,
          predictedAt: now,
          deadline,
          evidenceIdsJson: JSON.stringify(canonicalIds),
          dimensionsJson: JSON.stringify(dimensions),
          baselineJson: JSON.stringify(baseline),
          confirmingSignalsJson: JSON.stringify(confirming),
          weakeningSignalsJson: JSON.stringify(weakening),
          isFixture: event.isFixture,
        },
      })
      created++

      const scenarios = await prisma.futureScenario.findMany({ where: { eventCandidateId: id } })
      for (const scenarioType of GRADEABLE_SCENARIOS) {
        const s = scenarios.find((x) => x.scenarioType === scenarioType)
        if (!s) continue // consequence stage failed for this event — the event row still stands
        await prisma.outcomePrediction.create({
          data: {
            subjectKind: 'SCENARIO',
            eventCandidateId: id,
            scenarioType,
            dedupeKey: dedupeKeyFor(id, 'SCENARIO', scenarioType),
            predictionText: `${event.title}: ${s.title} is the path taken by ${deadlineDay}`,
            predictedProbability: s.confidence,
            finalProbability: s.confidence,
            predictedAt: now,
            deadline,
            evidenceIdsJson: JSON.stringify(canonicalIds),
            dimensionsJson: JSON.stringify(dimensions),
            baselineJson: JSON.stringify(baseline),
            confirmingSignalsJson: s.confirmingSignalsJson,
            weakeningSignalsJson: s.weakeningSignalsJson,
            isFixture: event.isFixture,
          },
        })
        created++
      }
    } catch (err) {
      errors.push({ stage: 'outcome:freeze', message: err instanceof Error ? err.message : String(err), eventCandidateId: id })
    }
  }
  return { created, errors }
}

/** Refreshes finalProbability on every OPEN prediction from the live event /
 *  scenario numbers. The frozen predictedProbability is never touched — this
 *  is the "was the system converging the right way" record. */
export async function updateOpenFinalProbabilities(): Promise<{ errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  const open = await prisma.outcomePrediction.findMany({ where: { status: 'OPEN' } })
  for (const p of open) {
    try {
      if (p.subjectKind === 'EVENT') {
        const event = await prisma.eventCandidate.findUnique({ where: { id: p.eventCandidateId } })
        if (event && event.probability !== p.finalProbability) {
          await prisma.outcomePrediction.update({ where: { id: p.id }, data: { finalProbability: event.probability } })
        }
      } else {
        const s = await prisma.futureScenario.findFirst({
          where: { eventCandidateId: p.eventCandidateId, scenarioType: p.scenarioType ?? undefined },
        })
        if (s && s.confidence !== p.finalProbability) {
          await prisma.outcomePrediction.update({ where: { id: p.id }, data: { finalProbability: s.confidence } })
        }
      }
    } catch (err) {
      errors.push({
        stage: 'outcome:final-probability',
        message: err instanceof Error ? err.message : String(err),
        predictionId: p.id,
      })
    }
  }
  return { errors }
}
