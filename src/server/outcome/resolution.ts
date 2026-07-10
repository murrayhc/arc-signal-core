import type { OutcomePrediction } from '@prisma/client'
import { prisma } from '@/server/db'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import { upsertReviewItem } from '@/server/review/service'
import type { OutcomePath, PredictionOutcome, ResolutionMethod } from '@/shared/enums'
import {
  HAPPENED_MIN_NEW_GROUPS,
  MAINSTREAM_CATEGORIES,
  RELIABILITY_COLLAPSE_BELOW,
  REVIEW_EXTENSION_DAYS,
} from './constants'
import { computeEvidenceDelta, type EvidenceDelta } from './evidence-window'
import { dedupeKeyFor } from './ledger'
import { classifyPath, scenarioMatchesPath } from './path-classifier'
import type { OutcomeError } from './types'

/**
 * Auto + review resolution. Every scan, every OPEN prediction is checked
 * against what changed since it froze; clear cases settle themselves with a
 * written, advice-guarded rationale, ambiguous cases queue for a one-click
 * human verdict. A resolution failure never fails a scan (caller isolates).
 */

const DAY_MS = 86_400_000
const utcDay = (d: Date) => d.toISOString().slice(0, 10)
const pctText = (n: number) => `${Math.round(n * 100)}%`

/** Days Archlight led the first mainstream (national press / wire) coverage.
 *  0 when detection itself came from mainstream; null when mainstream never
 *  covered it at all (counted separately as the flagship stat). */
export async function computeLeadTimeDays(eventCandidateId: string, firstDetectedAt: Date): Promise<number | null> {
  const canonicalIds = await canonicalIdsForEvent(eventCandidateId)
  if (canonicalIds.length === 0) return null
  const lineage = await prisma.claimLineage.findMany({ where: { canonicalClaimId: { in: canonicalIds } } })
  if (lineage.length === 0) return null
  const sources = await prisma.source.findMany({ where: { id: { in: [...new Set(lineage.map((l) => l.sourceId))] } } })
  const categoryOf = new Map(sources.map((s) => [s.id, s.category]))
  const dateOf = (l: (typeof lineage)[number]) => (l.publishedAt ?? l.firstSeenAt ?? l.createdAt).getTime()

  const earliestAny = Math.min(...lineage.map(dateOf))
  const mainstream = lineage.filter((l) => MAINSTREAM_CATEGORIES.has((categoryOf.get(l.sourceId) ?? '').toUpperCase()))
  if (mainstream.length === 0) return null
  const earliestMainstream = Math.min(...mainstream.map(dateOf))
  if (earliestMainstream <= earliestAny) return 0 // we learned it FROM mainstream
  return (earliestMainstream - firstDetectedAt.getTime()) / DAY_MS
}

async function resolvePrediction(
  p: OutcomePrediction,
  outcome: PredictionOutcome,
  resolvedBy: ResolutionMethod,
  rationale: string,
  evidenceIds: string[],
  now: Date,
  observedPath?: OutcomePath | null,
): Promise<void> {
  assertNoAdviceLanguage(rationale, 'OutcomePrediction.resolutionRationale')
  const gradeable = outcome !== 'UNRESOLVABLE'
  const y = outcome === 'HAPPENED' ? 1 : 0
  let leadTimeDays: number | null = null
  if (p.subjectKind === 'EVENT' && outcome === 'HAPPENED') {
    const event = await prisma.eventCandidate.findUnique({ where: { id: p.eventCandidateId } })
    if (event) leadTimeDays = await computeLeadTimeDays(p.eventCandidateId, event.firstDetectedAt)
  }
  await prisma.outcomePrediction.update({
    where: { id: p.id },
    data: {
      status: 'RESOLVED',
      outcome,
      resolvedBy,
      resolvedAt: now,
      resolutionRationale: rationale,
      resolutionEvidenceJson: JSON.stringify(evidenceIds),
      observedPath: observedPath ?? undefined,
      brierFirst: gradeable ? (p.predictedProbability - y) ** 2 : null,
      brierFinal: gradeable ? (p.finalProbability - y) ** 2 : null,
      leadTimeDays,
    },
  })
}

async function queueForReview(p: OutcomePrediction, reason: string, now: Date): Promise<void> {
  assertNoAdviceLanguage(reason, 'ReviewItem.reason(prediction)')
  await prisma.outcomePrediction.update({ where: { id: p.id }, data: { status: 'PENDING_REVIEW' } })
  const event = await prisma.eventCandidate.findUnique({ where: { id: p.eventCandidateId } })
  await upsertReviewItem({
    itemType: 'PREDICTION_RESOLUTION',
    subjectKind: 'prediction',
    subjectId: p.id,
    // deadline in the key: a NEEDS_MORE_EVIDENCE extension yields a FRESH item
    // at the new deadline instead of silently reusing the decided one.
    dedupeKey: `prediction:${p.id}:${p.deadline.toISOString()}`,
    title: `Prediction verdict needed: ${event?.title ?? p.eventCandidateId}`,
    reason,
    severity: 0.6,
    eventCandidateId: p.eventCandidateId,
    evidenceIds: [],
    detail: { predictionId: p.id, predictedProbability: p.predictedProbability, deadline: p.deadline.toISOString() },
  })
}

/** Grades all OPEN scenario rows of a RESOLVED event, stamping the observed
 *  path on every graded row and the event's own ledger row. */
async function gradeScenarios(
  eventRow: OutcomePrediction,
  delta: EvidenceDelta,
  now: Date,
  errors: OutcomeError[],
): Promise<number> {
  let resolved = 0
  const scenarios = await prisma.outcomePrediction.findMany({
    where: { eventCandidateId: eventRow.eventCandidateId, subjectKind: 'SCENARIO', status: 'OPEN' },
  })
  if (scenarios.length === 0) return 0
  const outcome = (eventRow.outcome ?? 'UNRESOLVABLE') as PredictionOutcome
  const resolvedBy = (eventRow.resolvedBy ?? 'REVIEW') as ResolutionMethod
  const path = classifyPath(outcome, resolvedBy, delta)

  for (const s of scenarios) {
    try {
      if (path === null) {
        await resolvePrediction(
          s,
          'UNRESOLVABLE',
          resolvedBy,
          `The event outcome was recorded unresolvable, so this scenario path is not graded.`,
          [],
          now,
          null,
        )
      } else {
        const matched = scenarioMatchesPath(s.scenarioType ?? '', path)
        await resolvePrediction(
          s,
          matched ? 'HAPPENED' : 'DID_NOT_HAPPEN',
          resolvedBy,
          `Observed path over the window: ${path.toLowerCase()} (${delta.newSupportGroups.length} new publisher group(s), ` +
            `${delta.newSupportDays} distinct day(s) of new corroboration, ${delta.newEntityCount} new affected entit(y/ies), ` +
            `${delta.newContradictions} new contradiction(s)). This scenario ${matched ? 'matches' : 'does not match'} that path.`,
          delta.newEvidenceIds,
          now,
          path,
        )
      }
      resolved++
    } catch (err) {
      errors.push({ stage: 'outcome:grade-scenario', message: err instanceof Error ? err.message : String(err), predictionId: s.id })
    }
  }
  if (path !== null && eventRow.observedPath == null) {
    await prisma.outcomePrediction.update({ where: { id: eventRow.id }, data: { observedPath: path } })
  }
  return resolved
}

/** Evaluates every OPEN prediction against the evidence that arrived since it
 *  froze. Event rows settle by the ordered rules; scenario rows grade at the
 *  deadline (REVERSED immediately) once their event is settled. */
export async function evaluateOpenPredictions(
  now: Date,
): Promise<{ resolved: number; pendingReview: number; errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  let resolved = 0
  let pendingReview = 0

  // ── Event-level pass ──
  const openEvents = await prisma.outcomePrediction.findMany({ where: { status: 'OPEN', subjectKind: 'EVENT' } })
  for (const p of openEvents) {
    try {
      const event = await prisma.eventCandidate.findUnique({ where: { id: p.eventCandidateId } })
      const delta = await computeEvidenceDelta(p)
      const pastDeadline = now.getTime() >= p.deadline.getTime()

      if (event?.status === 'DISMISSED') {
        await queueForReview(
          p,
          `The event was manually dismissed while this prediction (${pctText(p.predictedProbability)} by ${utcDay(p.deadline)}) was open. ` +
            `A human verdict settles whether it happened, did not happen, or is unresolvable (e.g. a duplicate).`,
          now,
        )
        pendingReview++
        continue
      }

      // Rule 1 — corroboration: a primary/official source, or ≥2 new
      // independent publisher groups with zero contradictions on record.
      const cleanCorroboration =
        delta.newSupportGroups.length >= HAPPENED_MIN_NEW_GROUPS &&
        delta.newContradictions === 0 &&
        !delta.anyCanonicalContradicted
      if (delta.primaryCorroboration || cleanCorroboration) {
        await resolvePrediction(
          p,
          'HAPPENED',
          'AUTO_EVIDENCE',
          `Corroborated after prediction: ${delta.newSupportGroups.length} new independent publisher group(s)` +
            (delta.primaryCorroboration ? ', including a primary/official source' : '') +
            `. Predicted at ${pctText(p.predictedProbability)}; outcome recorded ${utcDay(now)}.`,
          delta.newEvidenceIds,
          now,
        )
        resolved++
        continue
      }

      // Rule 2 — contradiction death.
      if (delta.anyCanonicalContradicted || (delta.minReliability < RELIABILITY_COLLAPSE_BELOW && delta.newContradictions > 0)) {
        await resolvePrediction(
          p,
          'DID_NOT_HAPPEN',
          'AUTO_EVIDENCE',
          `Contradicted: the claims behind this event are formally disputed ` +
            `(${delta.newContradictions} new contradicting report(s) since prediction; ` +
            `lowest claim reliability ${pctText(delta.minReliability)}). Predicted at ${pctText(p.predictedProbability)}.`,
          delta.newEvidenceIds,
          now,
        )
        resolved++
        continue
      }

      if (!pastDeadline) continue // wait — partial/mixed evidence settles at the deadline

      // Rule 4 — quiet deadline.
      if (delta.newSupportGroups.length === 0 && delta.newContradictions === 0) {
        await resolvePrediction(
          p,
          'DID_NOT_HAPPEN',
          'AUTO_DEADLINE',
          `No corroboration by deadline ${utcDay(p.deadline)}: no new evidence arrived after the prediction froze. ` +
            `Predicted at ${pctText(p.predictedProbability)}.`,
          [],
          now,
        )
        resolved++
        continue
      }

      // Rule 5 — mixed at deadline → human verdict.
      await queueForReview(
        p,
        `Deadline ${utcDay(p.deadline)} arrived with mixed evidence: ${delta.newSupportGroups.length} new publisher group(s) ` +
          `corroborating and ${delta.newContradictions} new contradiction(s). Predicted at ${pctText(p.predictedProbability)}. ` +
          `A human verdict settles the outcome.`,
        now,
      )
      pendingReview++
    } catch (err) {
      errors.push({ stage: 'outcome:evaluate', message: err instanceof Error ? err.message : String(err), predictionId: p.id })
    }
  }

  // ── Scenario pass: grade once the event is settled — immediately when the
  // event died (path terminal), at the deadline otherwise (containment/spread
  // is only observable over the full window). ──
  const openScenarios = await prisma.outcomePrediction.findMany({ where: { status: 'OPEN', subjectKind: 'SCENARIO' } })
  const byEvent = new Map<string, OutcomePrediction[]>()
  for (const s of openScenarios) {
    byEvent.set(s.eventCandidateId, [...(byEvent.get(s.eventCandidateId) ?? []), s])
  }
  for (const [eventCandidateId, scenarios] of byEvent) {
    try {
      const eventRow = await prisma.outcomePrediction.findUnique({
        where: { dedupeKey: dedupeKeyFor(eventCandidateId, 'EVENT') },
      })
      if (!eventRow || eventRow.status !== 'RESOLVED') continue
      const gradeNow =
        eventRow.outcome === 'DID_NOT_HAPPEN' ||
        eventRow.outcome === 'UNRESOLVABLE' ||
        scenarios.some((s) => now.getTime() >= s.deadline.getTime())
      if (!gradeNow) continue
      const delta = await computeEvidenceDelta(eventRow)
      resolved += await gradeScenarios(eventRow, delta, now, errors)
    } catch (err) {
      errors.push({ stage: 'outcome:grade-scenario', message: err instanceof Error ? err.message : String(err), eventCandidateId })
    }
  }

  return { resolved, pendingReview, errors }
}

/** Applies a human review verdict to a prediction. HAPPENED / DID_NOT_HAPPEN /
 *  UNRESOLVABLE settle the event row (and grade its scenarios immediately);
 *  NEEDS_MORE_EVIDENCE reopens it with an extended deadline — a fresh review
 *  item forms at the new deadline if the evidence stays mixed. */
export async function applyReviewVerdict(
  predictionId: string,
  verdict: PredictionOutcome | 'NEEDS_MORE_EVIDENCE',
  note?: string,
  now: Date = new Date(),
): Promise<void> {
  const p = await prisma.outcomePrediction.findUnique({ where: { id: predictionId } })
  if (!p || p.status === 'RESOLVED') return // already settled — verdicts are not reopened

  if (verdict === 'NEEDS_MORE_EVIDENCE') {
    await prisma.outcomePrediction.update({
      where: { id: p.id },
      data: { status: 'OPEN', deadline: new Date(p.deadline.getTime() + REVIEW_EXTENSION_DAYS * DAY_MS) },
    })
    return
  }

  const rationale =
    `Human verdict: ${verdict.toLowerCase().replace(/_/g, ' ')}` + (note ? ` — ${note}` : '') + `. Recorded ${utcDay(now)}.`
  const delta = await computeEvidenceDelta(p)
  const path = classifyPath(verdict, 'REVIEW', delta)
  await resolvePrediction(p, verdict, 'REVIEW', rationale, delta.newEvidenceIds, now, path)
  if (p.subjectKind === 'EVENT') {
    const eventRow = await prisma.outcomePrediction.findUniqueOrThrow({ where: { id: p.id } })
    const errors: OutcomeError[] = []
    await gradeScenarios(eventRow, delta, now, errors)
    // grading failures surface on the next scan; the verdict itself stands
  }
}
