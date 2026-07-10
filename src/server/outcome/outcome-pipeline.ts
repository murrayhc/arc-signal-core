import { freezePredictions, updateOpenFinalProbabilities } from './ledger'
import { evaluateOpenPredictions } from './resolution'
import { writeTrackRecordSnapshot } from './track-record'
import { maybeSuggestWeights } from './weight-learning'
import type { OutcomeCounts, OutcomeError } from './types'

/** Runs the outcome-resolution layer for one scan: freeze receipts for this
 *  scan's events, drift final probabilities on everything still open, then
 *  evaluate ALL open predictions (not just this scan's — deadlines are checked
 *  here, so no separate cron is needed). Each step is fault-isolated; the
 *  caller isolates the whole stage. Track-record snapshotting and weight
 *  learning append themselves here in their own stages. */
export async function runOutcomeResolution(
  events: { id: string }[],
  scanRunId: string,
  now: Date = new Date(),
): Promise<{ counts: OutcomeCounts; errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  const counts: OutcomeCounts = {
    predictionsCreated: 0,
    predictionsResolved: 0,
    predictionsPendingReview: 0,
    weightSuggestionsCreated: 0,
  }

  try {
    const frozen = await freezePredictions(events, now)
    errors.push(...frozen.errors)
    counts.predictionsCreated = frozen.created
  } catch (err) {
    errors.push({ stage: 'outcome:freeze', message: err instanceof Error ? err.message : String(err) })
  }

  try {
    const drift = await updateOpenFinalProbabilities()
    errors.push(...drift.errors)
  } catch (err) {
    errors.push({ stage: 'outcome:final-probability', message: err instanceof Error ? err.message : String(err) })
  }

  try {
    const evaluated = await evaluateOpenPredictions(now)
    errors.push(...evaluated.errors)
    counts.predictionsResolved = evaluated.resolved
    counts.predictionsPendingReview = evaluated.pendingReview
  } catch (err) {
    errors.push({ stage: 'outcome:evaluate', message: err instanceof Error ? err.message : String(err) })
  }

  const snapshot = await writeTrackRecordSnapshot(scanRunId)
  errors.push(...snapshot.errors)

  // Owner-gated learning: computes a suggestion when the resolved base is big
  // enough — never applies anything itself.
  const learning = await maybeSuggestWeights(scanRunId)
  errors.push(...learning.errors)
  counts.weightSuggestionsCreated = learning.created ? 1 : 0

  return { counts, errors }
}
