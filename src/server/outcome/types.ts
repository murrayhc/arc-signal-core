export type OutcomeError = {
  stage: string
  message: string
  eventCandidateId?: string
  predictionId?: string
}

export type OutcomeCounts = {
  predictionsCreated: number
  predictionsResolved: number
  predictionsPendingReview: number
  weightSuggestionsCreated: number
}

/** Evidence state frozen at prediction time — the reference point every later
 *  scan diffs against to detect NEW corroboration/contradiction/spread. */
export type PredictionBaseline = {
  groups: string[]
  entityIds: string[]
  contradictionCount: number
  supportDays: string[]
}
