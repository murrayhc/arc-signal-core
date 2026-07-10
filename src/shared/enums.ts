export const ACCESS_METHODS = ['RSS', 'FIXTURE', 'UNSUPPORTED'] as const
export type AccessMethod = (typeof ACCESS_METHODS)[number]

export const COLLECTOR_STATUSES = ['FUNCTIONAL', 'PLACEHOLDER', 'UNSUPPORTED'] as const
export type CollectorStatus = (typeof COLLECTOR_STATUSES)[number]

export const SCAN_STATUSES = ['RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'] as const
export type ScanStatus = (typeof SCAN_STATUSES)[number]

export const PARSE_STATUSES = ['PARSED', 'UNSUPPORTED', 'ERROR'] as const
export type ParseStatus = (typeof PARSE_STATUSES)[number]

export const CLAIM_TYPES = [
  'EXECUTIVE_CHANGE',
  'HIRING_CHANGE',
  'FINANCIAL_RESULT',
  'LAYOFF_MENTION',
  'FUNDING_MENTION',
  'PRODUCT_LAUNCH',
  'PRODUCT_FAILURE',
  'LEGAL_EVENT',
  'REGULATORY_EVENT',
  'SUPPLY_CHAIN_EVENT',
  'MACRO_EVENT',
  'SENTIMENT_EVENT',
  'PROCUREMENT_EVENT',
  'MARKET_DEMAND_EVENT',
  'UNKNOWN',
] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const SIGNAL_TYPES = [
  'HIRING_ACCELERATION',
  'HIRING_SLOWDOWN',
  'EXECUTIVE_EXIT',
  'EXECUTIVE_HIRE',
  'LAYOFF_SIGNAL',
  'FUNDING_SIGNAL',
  'CASH_PRESSURE',
  'LEGAL_PRESSURE',
  'CUSTOMER_COMPLAINT_SPIKE',
  'PRODUCT_MOMENTUM',
  'PRODUCT_DECAY',
  'MACRO_PRESSURE',
  'SECTOR_PRESSURE',
  'SUPPLY_CHAIN_PRESSURE',
  'REGULATORY_PRESSURE',
  'PROCUREMENT_INCREASE',
  'DEMAND_SPIKE',
  'TALENT_MARKET_SHIFT',
  'UNKNOWN',
] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const DIRECTIONS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'UNKNOWN'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const EVENT_CLASSES = ['RISK', 'OPPORTUNITY', 'MIXED', 'WATCH', 'UNKNOWN'] as const
export type EventClass = (typeof EVENT_CLASSES)[number]

export const EVENT_STATUSES = [
  'NEW',
  'RISING',
  'STABLE',
  'DECLINING',
  'CONFIRMED',
  'DISMISSED',
  'ESCALATED',
  'NEEDS_REVIEW',
] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const FEED_TYPES = ['RISK_RADAR', 'OPPORTUNITY_RADAR', 'INBOX', 'WATCHLIST'] as const
export type FeedType = (typeof FEED_TYPES)[number]

export const SOURCE_HEALTH_STATUSES = ['HEALTHY', 'DEGRADED', 'FAILING', 'UNSUPPORTED', 'UNKNOWN'] as const
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number]

export const OPPORTUNITY_TYPES = [
  'SALES', 'PARTNERSHIP', 'PROCUREMENT', 'INVESTMENT_WATCH', 'HIRING',
  'TALENT_ACQUISITION', 'M_AND_A', 'CONTENT', 'ADVISORY', 'PRODUCT_GAP',
  'MARKET_ENTRY', 'COMPETITOR_DISPLACEMENT', 'COMPLIANCE', 'CRISIS_SUPPORT',
] as const
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

export const OPPORTUNITY_STATUSES = [
  'NEW', 'RISING', 'STABLE', 'DECLINING', 'DISMISSED', 'ESCALATED', 'ACTIONED',
] as const
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]

export const POSITIONING_USER_TYPES = [
  'SUPPLIER', 'RECRUITER', 'PRODUCT_TEAM', 'PROCUREMENT', 'INVESTOR_WATCH',
  'ADVISOR', 'ANALYST', 'GENERAL',
] as const
export type PositioningUserType = (typeof POSITIONING_USER_TYPES)[number]

export const RISK_APPETITES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskAppetite = (typeof RISK_APPETITES)[number]

export const NODE_TYPES = [
  'EVENT','SOURCE','DOCUMENT','CLAIM','SIGNAL','COMPANY','SECTOR','COMMODITY',
  'INSTRUMENT','PERSON','REGION','REGULATION','PROCUREMENT','RISK','OPPORTUNITY',
  'POSITIONING','CONTRADICTION','DATA_GAP',
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const EDGE_TYPES = [
  'REPORTED_BY','DERIVED_FROM','SUPPORTS','CONTRADICTS','AFFECTS','EXPOSES',
  'AMPLIFIES','WEAKENS','CAUSES_PRESSURE_ON','CREATES_OPPORTUNITY_FOR',
  'LINKED_TO','PRICED_BY','REGULATED_BY','SUPPLIED_BY','DEPENDS_ON','COMPETES_WITH',
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

export const ARC_CLASSES = [
  'STRONG_CHAIN','WEAK_SIGNAL','WIDELY_REPEATED_WEAK_SOURCE','CONTRADICTED',
  'HIGH_POTENTIAL_LOW_CONFIDENCE',
] as const
export type ArcClass = (typeof ARC_CLASSES)[number]

export const QUERY_TYPES = [
  'COMPANY','COMMODITY','INSTRUMENT','TICKER','SHARE_PRICE','SECTOR','REGION',
  'THEME','REGULATION','PROCUREMENT','UNKNOWN',
] as const
export type QueryType = (typeof QUERY_TYPES)[number]

export const LLM_TASK_TYPES = [
  'CLAIM_EXTRACTION_ASSIST','ENTITY_RESOLUTION_ASSIST','SIGNAL_CLASSIFICATION_ASSIST',
  'CONTRADICTION_ANALYSIS','EVIDENCE_ARC_SUMMARY','STRATEGIC_POSITIONING_GENERATION',
  'OPPORTUNITY_PLAYBOOK_GENERATION','EXECUTIVE_BRIEF_GENERATION','GRAPH_NODE_SUMMARY',
  'GRAPH_EDGE_EXPLANATION','MARKET_CONTEXT_SYNTHESIS','RISK_OPPORTUNITY_SYNTHESIS',
  'OUTREACH_DRAFT_GENERATION','TRANSLATION','LONG_CONTEXT_REVIEW','FAST_CLASSIFICATION','SAFETY_REVIEW',
  'INVESTIGATION_QUERY_GENERATION',
  'CLAIM_NORMALISATION','SOURCE_COMPARISON','COMPANY_IMPACT_ANALYSIS','HISTORIC_CONTEXT','PRESENT_CONTEXT',
  'FUTURE_SCENARIOS','STRATEGIC_POSITIONING','REPORT_SYNTHESIS','JSON_REPAIR',
] as const
export type LLMTaskType = (typeof LLM_TASK_TYPES)[number]

export const LLM_RUN_STATUSES = ['PENDING','SUCCEEDED','FAILED','SKIPPED_NO_PROVIDER','SKIPPED_BUDGET','SKIPPED_UNROUTED','REJECTED_VALIDATION'] as const
export type LLMRunStatus = (typeof LLM_RUN_STATUSES)[number]

export const VALIDATION_STATUSES = ['PASSED','FAILED','NOT_RUN'] as const
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number]

export const PLAYBOOK_GENERATORS = ['DETERMINISTIC','LLM'] as const
export type PlaybookGenerator = (typeof PLAYBOOK_GENERATORS)[number]

export const MARKET_RESULT_TYPES = ['INSTRUMENT','COMMODITY','COMPANY','NONE'] as const
export type MarketResultType = (typeof MARKET_RESULT_TYPES)[number]

export const INSTRUMENT_TYPES = ['EQUITY','ETF','INDEX','FX','FUTURE','BOND','CRYPTO','UNKNOWN'] as const
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number]

export const COMMODITY_CATEGORIES = ['METAL','ENERGY','AGRICULTURE','LIVESTOCK','INDUSTRIAL','OTHER'] as const
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number]

export const MARKET_PROVIDER_STATUSES = ['CONFIGURED','NOT_CONFIGURED'] as const
export type MarketProviderStatus = (typeof MARKET_PROVIDER_STATUSES)[number]

export const PORTFOLIO_STATUSES = ['NEW','INVESTIGATING','QUALIFIED','REJECTED','ACTING','WON','LOST','WATCHING'] as const
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number]

export const GRAPH_EVENT_TYPES = [
  'FIRST_DETECTED','NEW_SOURCE','CLAIM_REPEATED','SIGNAL_STRENGTHENED','CONTRADICTION_DETECTED',
  'OPPORTUNITY_GENERATED','CONFIDENCE_ROSE','CONFIDENCE_FELL','EVENT_COOLED','EVENT_ESCALATED',
] as const
export type GraphEventType = (typeof GRAPH_EVENT_TYPES)[number]

export const GRAPH_SNAPSHOT_TYPES = ['EVENT_FORMATION','CURRENT_STATE','MANUAL'] as const
export type GraphSnapshotType = (typeof GRAPH_SNAPSHOT_TYPES)[number]

// ── Evidence Depth Engine (Pass 2) ─────────────────────────────────────────

export const ATOMIC_CLAIM_TYPES = [
  'LAYOFF_SIGNAL','HIRING_CHANGE','REGULATORY_PRESSURE','PROCUREMENT_ACTIVITY',
  'SUPPLY_CHAIN_PRESSURE','MARKET_MOVEMENT','COMMODITY_PRESSURE','COMPANY_STATEMENT',
  'EXECUTIVE_CHANGE','LEGAL_EVENT','CUSTOMER_COMPLAINT','DEMAND_SIGNAL','FUNDING_SIGNAL',
  'MACRO_SIGNAL','UNKNOWN',
] as const
export type AtomicClaimType = (typeof ATOMIC_CLAIM_TYPES)[number]

export const FACTUALITY_LABELS = [
  'SUPPORTED','STRONGLY_SUPPORTED','WEAK_SINGLE_SOURCE','CONTRADICTED','STALE',
  'RECYCLED','UNVERIFIED','NEEDS_REVIEW',
] as const
export type FactualityLabel = (typeof FACTUALITY_LABELS)[number]

export const RELATION_TO_ORIGIN = [
  'ORIGIN_CANDIDATE','INDEPENDENT_SUPPORT','LIKELY_COPY','COMMENTARY','CONTRADICTION','UNKNOWN',
] as const
export type RelationToOrigin = (typeof RELATION_TO_ORIGIN)[number]

export const QUERY_CLASSES = [
  'ORIGIN_TRACE','SUPPORTING_EVIDENCE','CONTRADICTION','AFFECTED_ENTITIES',
  'BENEFICIARY_SEARCH','HARMED_PARTY_SEARCH','HISTORIC_ANALOGUE','FUTURE_SCENARIO_SIGNAL',
] as const
export type QueryClass = (typeof QUERY_CLASSES)[number]

export const CANONICAL_CLAIM_STATUSES = ['ACTIVE','MERGED','STALE','SUPERSEDED'] as const
export type CanonicalClaimStatus = (typeof CANONICAL_CLAIM_STATUSES)[number]

export const INVESTIGATION_QUERY_STATUSES = ['GENERATED','RUNNING','COMPLETED','FAILED','SKIPPED_NO_ADAPTER'] as const
export type InvestigationQueryStatus = (typeof INVESTIGATION_QUERY_STATUSES)[number]

export const SEARCH_ADAPTER_STATUSES = ['CONFIGURED','NOT_CONFIGURED'] as const
export type SearchAdapterStatus = (typeof SEARCH_ADAPTER_STATUSES)[number]

// ── Commercial Consequence Engine (Pass 3) ─────────────────────────────────

export const IMPACT_TYPES = ['BENEFICIARY','HARMED','MIXED','EXPOSED','WATCH_ONLY','UNKNOWN'] as const
export type ImpactType = (typeof IMPACT_TYPES)[number]

export const SCENARIO_TYPES = ['CONSERVATIVE','BASE_CASE','ACCELERATED','REVERSAL','LOW_CONFIDENCE'] as const
export type ScenarioType = (typeof SCENARIO_TYPES)[number]

export const REPORT_TYPES = [
  'EXECUTIVE_BRIEF','SALES_OPPORTUNITY_BRIEF','RISK_BRIEF','PROCUREMENT_BRIEF',
  'MARKET_CONTEXT_BRIEF','COMPANY_EXPOSURE_BRIEF',
] as const
export type ReportType = (typeof REPORT_TYPES)[number]

// ── Review queue (Stage 6, human-in-the-loop) ──────────────────────────────

export const REVIEW_ITEM_TYPES = [
  'QUARANTINED_CLAIM',    // a recycled/contradicted claim withheld from events
  'LOW_CONFIDENCE_IMPACT', // a named company impact below the confidence floor
  'AMBIGUOUS_ENTITY',      // a mention the resolver could not classify
  'CONTRADICTION_SPIKE',   // an event carrying an unusual density of contradictions
  'MANIPULATION_ALERT',    // a claim flagged for copy-burst amplification
  'PREDICTION_RESOLUTION', // a prediction whose outcome needs a human verdict
] as const
export type ReviewItemType = (typeof REVIEW_ITEM_TYPES)[number]

export const REVIEW_STATUSES = ['PENDING','APPROVED','REJECTED','NEEDS_MORE_EVIDENCE'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

// ── Outcome-Resolution Engine (Stage 11) ───────────────────────────────────

export const PREDICTION_SUBJECT_KINDS = ['EVENT', 'SCENARIO'] as const
export type PredictionSubjectKind = (typeof PREDICTION_SUBJECT_KINDS)[number]

export const PREDICTION_STATUSES = ['OPEN', 'PENDING_REVIEW', 'RESOLVED'] as const
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number]

export const PREDICTION_OUTCOMES = ['HAPPENED', 'DID_NOT_HAPPEN', 'UNRESOLVABLE'] as const
export type PredictionOutcome = (typeof PREDICTION_OUTCOMES)[number]

export const RESOLUTION_METHODS = ['AUTO_EVIDENCE', 'AUTO_DEADLINE', 'REVIEW'] as const
export type ResolutionMethod = (typeof RESOLUTION_METHODS)[number]

export const OUTCOME_PATHS = ['REVERSED', 'CONTAINED', 'SUSTAINED', 'WIDENED', 'NONE'] as const
export type OutcomePath = (typeof OUTCOME_PATHS)[number]

export const WEIGHT_SUGGESTION_STATUSES = ['SUGGESTED', 'APPLIED', 'DISMISSED'] as const
export type WeightSuggestionStatus = (typeof WEIGHT_SUGGESTION_STATUSES)[number]
