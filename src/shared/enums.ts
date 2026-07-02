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
