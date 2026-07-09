import type { FactualityLabel } from '@/shared/enums'

/** Deterministic normalisation output — the unit of similarity comparison. */
export type NormalisedText = { normalised: string; tokens: Set<string>; trigrams: Set<string> }

/** Non-fatal error carried through the evidence-depth stages (mirrors the
 *  pipeline's PipelineError shape so the orchestrator can fold them in). */
export type EvidenceError = { stage: string; message: string; documentId?: string; canonicalClaimId?: string }

export type ReliabilityDimensions = {
  authority: number
  freshness: number
  specificity: number
  independence: number
  support: number
  contradiction: number
  copyLoopRisk: number
  /** Lineage's confidence that the earliest report is the true origin. */
  originTrace: number
  /** Copy-burst / coordinated-amplification signal (penalty). */
  manipulationRisk: number
}

export type ReliabilityResult = {
  reliabilityScore: number // 0..1
  factualityLabel: FactualityLabel
  dimensions: ReliabilityDimensions
  reasoningSummary: string
  evidenceFor: string[]
  evidenceAgainst: string[]
  warnings: string[]
}

export type InvestigationLimits = {
  maxDepth: number
  maxQueriesPerClaim: number
  maxDocumentsPerQuery: number
  maxRuntimeMs?: number
  maxCostBudget?: number
  allowedSourceTypes?: string[]
}

export const DEFAULT_INVESTIGATION_LIMITS: InvestigationLimits = {
  maxDepth: 3,
  maxQueriesPerClaim: 12,
  maxDocumentsPerQuery: 10,
}

export type InvestigationStoppedReason =
  | 'NO_ADAPTER_CONFIGURED'
  | 'MAX_DEPTH'
  | 'SATURATED'
  | 'NO_NEW_EVIDENCE'
  | 'LIMIT'

export type InvestigationSummary = {
  target: { canonicalClaimId?: string; eventCandidateId?: string }
  queriesGenerated: number
  adaptersTried: number
  documentsAdded: number
  stoppedReason: InvestigationStoppedReason
}

/** Counters surfaced by the evidence-depth block and spread into ScanRun. */
export type EvidenceDepthCounts = {
  atomicClaimsExtracted: number
  canonicalClaimsCreated: number
  canonicalClaimsUpdated: number
  claimClustersUpserted: number
  lineageRecordsCreated: number
  investigationQueriesGenerated: number
}
