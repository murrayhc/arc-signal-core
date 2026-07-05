import type { NormalisedText } from './types'

/** Small English stopword set — enough to stop function words dominating the
 *  token overlap. Deliberately not exhaustive. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'as', 'at', 'by', 'it', 'its', 'this', 'that', 'these', 'those', 'with', 'from',
  'has', 'have', 'had', 'will', 'would', 'could', 'should', 'may', 'might', 'said', 'says', 'say',
  'after', 'over', 'into', 'than', 'then', 'but', 'not', 'no', 'out', 'up', 'down', 'about', 'their',
  'his', 'her', 'they', 'he', 'she', 'we', 'you', 'i', 's', 't', 're', 've', 'll', 'd', 'm',
])

/** Similarity at/above which two claims are treated as the SAME canonical claim
 *  (gated further by type/entity in the canonical service). */
export const MATCH_THRESHOLD = 0.4
/** Similarity at/above which one claim is treated as a near-verbatim COPY of
 *  another (used by lineage to separate copies from independent reporting). */
export const COPY_THRESHOLD = 0.72

/** Lowercase, strip punctuation, drop stopwords → token set + char-trigram set. */
export function normalise(text: string): NormalisedText {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const tokens = new Set(cleaned.split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w)))
  const normalised = [...tokens].join(' ')
  return { normalised, tokens, trigrams: charTrigrams(normalised) }
}

function charTrigrams(s: string): Set<string> {
  const grams = new Set<string>()
  for (let i = 0; i + 3 <= s.length; i++) grams.add(s.slice(i, i + 3))
  return grams
}

/** Jaccard overlap of two sets. Both-empty → 0 (undefined similarity, treated
 *  as "no evidence of similarity" rather than a false perfect match). */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export function trigramSimilarity(a: Set<string>, b: Set<string>): number {
  return jaccard(a, b)
}

/** Blend of token overlap (meaning) and trigram overlap (surface wording). */
export function blendedSimilarity(a: NormalisedText, b: NormalisedText): number {
  return 0.55 * jaccard(a.tokens, b.tokens) + 0.45 * jaccard(a.trigrams, b.trigrams)
}
