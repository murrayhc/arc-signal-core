export type ConsequenceError = { stage: string; message: string; eventCandidateId?: string; entityId?: string }

export type ConsequenceCounts = {
  companyImpactsCreated: number
  contextSynthesesCreated: number
  futureScenariosCreated: number
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
  lastUpdated: string
}
