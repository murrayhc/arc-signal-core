import { blendedSimilarity, normalise } from '../text'

/**
 * Embedding provider interface — the seam that removes the permanent lexical
 * (token/trigram Jaccard) ceiling on claim similarity. Dormant by default,
 * exactly like the LLM / market / search layers: with no provider configured,
 * similarity stays the proven deterministic `blendedSimilarity`; register a
 * real embedding provider and paraphrase detection upgrades with no other
 * change. Never a hard dependency, never a cost unless the owner activates it.
 */

export type EmbeddingVector = number[]

export interface EmbeddingProvider {
  name: string
  status(): 'CONFIGURED' | 'NOT_CONFIGURED'
  /** Embed a batch of texts. Order-preserving. */
  embed(texts: string[]): Promise<EmbeddingVector[]>
}

/** Cosine similarity of two equal-length vectors, clamped to [0,1] (negatives
 *  floored — for text embeddings a negative cosine is "unrelated", = 0). */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return Math.max(0, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb))))
}

/** Empty by construction — no embedding provider ships. Register one here
 *  (key-gated) and enable it via EMBEDDING_PROVIDER. Mirrors the search
 *  adapter registry. */
export const EMBEDDING_PROVIDER_REGISTRY: Record<string, () => EmbeddingProvider> = {}

/** The active embedding provider (env-gated), or null when dormant. */
export function getActiveEmbeddingProvider(): EmbeddingProvider | null {
  const name = process.env.EMBEDDING_PROVIDER
  if (!name) return null
  const build = EMBEDDING_PROVIDER_REGISTRY[name.toLowerCase()]
  if (!build) return null
  const provider = build()
  return provider.status() === 'CONFIGURED' ? provider : null
}

/** A similarity function over two texts, 0..1. */
export type SimilarityFn = (a: string, b: string) => number

/** The deterministic lexical similarity — the always-available default and the
 *  fallback whenever embeddings are dormant. */
export const lexicalSimilarity: SimilarityFn = (a, b) => blendedSimilarity(normalise(a), normalise(b))

/**
 * Builds a similarity function over a fixed set of texts. When an embedding
 * provider is active, embeds them ONCE and returns a cosine-based comparator
 * (semantic — catches paraphrase without shared tokens). When dormant, returns
 * the lexical comparator. Batch-embedding up front keeps this O(1) provider
 * calls per clustering pass, not O(n²).
 */
export async function buildSimilarity(
  texts: string[],
  provider: EmbeddingProvider | null = getActiveEmbeddingProvider(),
): Promise<{ fn: SimilarityFn; mode: 'semantic' | 'lexical' }> {
  if (!provider) return { fn: lexicalSimilarity, mode: 'lexical' }
  try {
    const unique = [...new Set(texts)]
    const vectors = await provider.embed(unique)
    const byText = new Map<string, EmbeddingVector>()
    unique.forEach((t, i) => byText.set(t, vectors[i]))
    const fn: SimilarityFn = (a, b) => {
      const va = byText.get(a)
      const vb = byText.get(b)
      // Fall back to lexical for any text not in the pre-embedded batch.
      if (!va || !vb) return lexicalSimilarity(a, b)
      return cosineSimilarity(va, vb)
    }
    return { fn, mode: 'semantic' }
  } catch {
    // Any embedding failure degrades to lexical — never crashes clustering.
    return { fn: lexicalSimilarity, mode: 'lexical' }
  }
}
