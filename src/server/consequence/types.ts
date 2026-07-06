export type ConsequenceError = { stage: string; message: string; eventCandidateId?: string; entityId?: string }

export type ConsequenceCounts = {
  companyImpactsCreated: number
  contextSynthesesCreated: number
  futureScenariosCreated: number
}

/** Outcome of an on-demand AI enrichment pass over one event. */
export type EnrichmentResult = {
  status: 'ENRICHED' | 'DORMANT'
  impactsEnriched: number
  contextEnriched: boolean
  skipped: number
}

/** API/UI view of a CompanyImpact — JSON fields parsed to arrays. */
export type CompanyImpactView = {
  id: string
  companyName: string
  impactType: string
  confidence: number
  impactPathway: string
  evidenceIds: string[]
  watchSignals: string[]
  riskScore: number
  opportunityScore: number
  entityId: string | null
  lowConfidence: boolean
  /** AI-written "why", when the impact has been enriched; null otherwise. */
  llmRationale: string | null
  /** True when this impact carries AI-enriched rationale. */
  aiEnhanced: boolean
  lastUpdated: string
}
