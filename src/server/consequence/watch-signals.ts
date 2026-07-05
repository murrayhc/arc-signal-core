import type { ImpactType } from '@/shared/enums'

/** Places we must never treat as companies — keeps geographic tokens extracted
 *  alongside org names (e.g. "Manchester") out of the named-company list. */
const PLACES = new Set([
  'manchester', 'london', 'leeds', 'birmingham', 'glasgow', 'edinburgh', 'bristol', 'liverpool', 'sheffield',
  'cardiff', 'belfast', 'newcastle', 'nottingham',
  'uk', 'united kingdom', 'britain', 'england', 'scotland', 'wales', 'ireland',
  'europe', 'european union', 'eu', 'us', 'usa', 'u.s.', 'united states', 'america', 'north america',
  'china', 'japan', 'india', 'germany', 'france', 'spain', 'italy', 'netherlands', 'korea', 'taiwan',
  'asia', 'africa', 'middle east', 'north sea', 'russia', 'australia', 'chile', 'peru',
])

/** True when a capitalised token looks like an organisation rather than a place
 *  or a sentence-initial common word. Conservative: a place is never a company. */
export function isLikelyOrganisation(name: string): boolean {
  const n = name.trim()
  if (n.length < 3) return false
  if (PLACES.has(n.toLowerCase())) return false
  return /^[A-Z]/.test(n)
}

export const CLAIM_TYPE_WORDS: Record<string, string> = {
  LAYOFF_SIGNAL: 'layoffs',
  HIRING_CHANGE: 'hiring changes',
  REGULATORY_PRESSURE: 'regulatory pressure',
  PROCUREMENT_ACTIVITY: 'procurement activity',
  SUPPLY_CHAIN_PRESSURE: 'supply-chain disruption',
  MARKET_MOVEMENT: 'market movement',
  COMMODITY_PRESSURE: 'commodity pressure',
  COMPANY_STATEMENT: 'a company statement',
  EXECUTIVE_CHANGE: 'an executive change',
  LEGAL_EVENT: 'legal action',
  CUSTOMER_COMPLAINT: 'customer complaints',
  DEMAND_SIGNAL: 'a demand shift',
  FUNDING_SIGNAL: 'funding activity',
  MACRO_SIGNAL: 'macroeconomic pressure',
  UNKNOWN: 'a development',
}

const CLAIM_TYPE_WATCH_SIGNALS: Record<string, string[]> = {
  LAYOFF_SIGNAL: ['further redundancy announcements', 'a hiring freeze', 'site-closure notices'],
  HIRING_CHANGE: ['new job postings', 'headcount disclosures'],
  REGULATORY_PRESSURE: ['new regulator statements', 'fines or sanctions', 'compliance deadlines'],
  PROCUREMENT_ACTIVITY: ['new tender awards', 'framework listings', 'contract notices'],
  SUPPLY_CHAIN_PRESSURE: ['supplier disruption reports', 'inventory warnings', 'lead-time changes'],
  MARKET_MOVEMENT: ['further reported price moves', 'company statements'],
  COMMODITY_PRESSURE: ['commodity price and supply updates', 'export restrictions', 'new supply deals'],
  COMPANY_STATEMENT: ['official company updates', 'regulatory filings'],
  EXECUTIVE_CHANGE: ['further leadership changes', 'strategy statements'],
  LEGAL_EVENT: ['court dates', 'settlement news', 'regulatory follow-up'],
  CUSTOMER_COMPLAINT: ['service-status updates', 'customer-sentiment shifts'],
  DEMAND_SIGNAL: ['order-book updates', 'capacity announcements'],
  FUNDING_SIGNAL: ['funding-round closes', 'hiring surges', 'expansion news'],
  MACRO_SIGNAL: ['policy updates', 'economic-data releases'],
  UNKNOWN: ['further reporting on this claim'],
}

export function watchSignalsForClaimType(t: string): string[] {
  return CLAIM_TYPE_WATCH_SIGNALS[t] ?? ['further reporting on this claim']
}

/** Claim types where the named party is EXPOSED to a pressure rather than
 *  simply helped or harmed by an outcome. */
const EXPOSURE_TYPES = new Set(['REGULATORY_PRESSURE', 'COMMODITY_PRESSURE', 'SUPPLY_CHAIN_PRESSURE'])

/** Maps an event's class + claim types + reliability to a named party's impact
 *  type. Thin evidence degrades to WATCH_ONLY; pressure claim types → EXPOSED. */
export function impactTypeFor(eventClass: string, claimTypes: string[], reliability: number): ImpactType {
  if (reliability < 0.3) return 'WATCH_ONLY'
  if (claimTypes.some((t) => EXPOSURE_TYPES.has(t))) return 'EXPOSED'
  switch (eventClass) {
    case 'RISK':
      return 'HARMED'
    case 'OPPORTUNITY':
      return 'BENEFICIARY'
    case 'MIXED':
      return 'MIXED'
    case 'WATCH':
      return 'WATCH_ONLY'
    default:
      return 'UNKNOWN'
  }
}
