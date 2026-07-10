import { prisma } from '@/server/db'

export type ReliabilityWeights = {
  authority: number
  independence: number
  support: number
  specificity: number
  freshness: number
  originTrace: number
}

/** Today's hardcoded reliability weights — the deterministic default. An
 *  APPLIED ReliabilityWeightSuggestion (owner action, Stage 11) overrides
 *  them; with none applied, scoring is byte-identical to the pre-Stage-11
 *  engine (pinned by tests/stage11-weights-seam.test.ts). */
export const DEFAULT_WEIGHTS: ReliabilityWeights = {
  authority: 0.26,
  independence: 0.28,
  support: 0.12,
  specificity: 0.14,
  freshness: 0.12,
  originTrace: 0.08,
}

export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof ReliabilityWeights)[]

const CACHE_TTL_MS = 30_000
let cache: { weights: ReliabilityWeights; at: number } | null = null

export function clearWeightsCache(): void {
  cache = null
}

function parseWeights(json: string): ReliabilityWeights | null {
  try {
    const w = JSON.parse(json) as Record<string, unknown>
    if (WEIGHT_KEYS.every((k) => typeof w?.[k] === 'number' && Number.isFinite(w[k] as number))) {
      return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, w[k] as number])) as ReliabilityWeights
    }
  } catch {
    // malformed JSON — fall through to null (defaults win)
  }
  return null
}

/** Active reliability weights: the most recently APPLIED suggestion, else the
 *  defaults. Cached briefly; apply/dismiss (and tests) clear the cache. */
export async function getActiveWeights(): Promise<ReliabilityWeights> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.weights
  const applied = await prisma.reliabilityWeightSuggestion.findFirst({
    where: { status: 'APPLIED' },
    orderBy: { appliedAt: 'desc' },
  })
  const weights = (applied && parseWeights(applied.suggestedWeightsJson)) ?? DEFAULT_WEIGHTS
  cache = { weights, at: Date.now() }
  return weights
}
