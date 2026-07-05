/** Deterministic source-authority prior, keyed on the existing Source.category.
 *  Official / primary / regulator / filing sources outrank news, which outranks
 *  blogs and social. Feeds the reliability engine so a claim's confidence
 *  reflects WHO reported it, not just how many outlets did. No new schema
 *  column — derived from data already on Source. */
export const AUTHORITY_BY_CATEGORY: Record<string, number> = {
  OFFICIAL: 0.95,
  REGULATOR: 0.95,
  GOVERNMENT: 0.92,
  FILING: 0.9,
  PRIMARY: 0.9,
  STATISTICS: 0.88,
  ACADEMIC: 0.8,
  NEWS: 0.55,
  WIRE: 0.5,
  TRADE: 0.5,
  AGGREGATOR: 0.4,
  BLOG: 0.3,
  SOCIAL: 0.25,
  UNKNOWN: 0.35,
}

const DEFAULT_AUTHORITY = 0.35

/** Returns a 0..1 authority prior for a source. `accessMethod` is accepted for
 *  interface stability (a future primary-document adapter may raise authority)
 *  but does not currently change the score. */
export function deriveAuthority(category: string, accessMethod?: string): number {
  const key = (category ?? '').toUpperCase()
  const base = AUTHORITY_BY_CATEGORY[key] ?? DEFAULT_AUTHORITY
  return Math.max(0, Math.min(1, base))
}
