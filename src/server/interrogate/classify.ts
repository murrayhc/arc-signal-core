import type { QueryType } from '@/shared/enums'

export type ClassifyOptions = {
  knownSectors?: string[]
  knownRegions?: string[]
  knownCompanies?: string[]
}

const TICKER_RE = /^[A-Z]{1,5}$/
const SHARE_PRICE_RE = /\b(share price|stock price)\b/i
const CURRENCY_RE = /[£$]/
const PRICE_RE = /\bprice\b/i
const INSTRUMENT_WORDS = ['bond', 'futures', 'future', 'option', 'options', 'etf', 'index', 'forward', 'forwards', 'swap']
const COMMODITY_WORDS = ['lithium', 'oil', 'gas', 'copper', 'wheat', 'gold', 'steel', 'cobalt', 'nickel', 'solar']
const REGULATION_RE = /\b(regulation|regulatory|compliance)\b/i
const PROCUREMENT_RE = /\b(tender|procurement|framework agreement)\b/i

function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(haystack)
}

/**
 * Pure query classifier. Rules are exact and first-match-wins: empty -> UNKNOWN;
 * a known region/sector (case-insensitive exact match) -> REGION/SECTOR — checked
 * ahead of the generic TICKER shape so a caller-supplied known name (e.g. "UK")
 * isn't misread as a ticker; short all-caps token -> TICKER; share/stock price or
 * currency symbol -> SHARE_PRICE; "price" + an instrument word -> INSTRUMENT; a
 * known commodity word -> COMMODITY; regulation-ish phrasing -> REGULATION;
 * procurement-ish phrasing -> PROCUREMENT; a known company (case-insensitive
 * contains) -> COMPANY; else THEME.
 */
export function classifyQuery(q: string, opts: ClassifyOptions = {}): QueryType {
  const trimmed = q.trim()
  if (trimmed.length === 0) return 'UNKNOWN'

  const knownRegions = opts.knownRegions ?? []
  if (knownRegions.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return 'REGION'

  const knownSectors = opts.knownSectors ?? []
  if (knownSectors.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return 'SECTOR'

  if (TICKER_RE.test(trimmed)) return 'TICKER'

  if (CURRENCY_RE.test(trimmed) || SHARE_PRICE_RE.test(trimmed)) return 'SHARE_PRICE'

  if (PRICE_RE.test(trimmed) && INSTRUMENT_WORDS.some((w) => containsWord(trimmed, w))) return 'INSTRUMENT'

  if (COMMODITY_WORDS.some((w) => containsWord(trimmed, w))) return 'COMMODITY'

  if (REGULATION_RE.test(trimmed)) return 'REGULATION'

  if (PROCUREMENT_RE.test(trimmed)) return 'PROCUREMENT'

  const knownCompanies = opts.knownCompanies ?? []
  if (knownCompanies.some((c) => c.toLowerCase().includes(trimmed.toLowerCase()))) return 'COMPANY'

  return 'THEME'
}
