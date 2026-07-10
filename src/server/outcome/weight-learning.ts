import { prisma } from '@/server/db'
import { clearWeightsCache, getActiveWeights, WEIGHT_KEYS, type ReliabilityWeights } from '@/server/evidence/weights'
import {
  MAX_WEIGHT_SHIFT,
  MIN_BRIER_IMPROVEMENT,
  MIN_RESOLVED_FOR_LEARNING,
  WEIGHT_CEIL,
  WEIGHT_FLOOR,
} from './constants'
import type { OutcomeError } from './types'

/**
 * Owner-gated reliability-weight learning. Each scan with enough resolved
 * outcomes runs a deterministic, bounded backtest: would different positive
 * weights have made the reliability engine more predictive of what actually
 * happened? The best candidate is stored as a SUGGESTION with per-dimension
 * rationale — NOTHING applies until the owner clicks Apply. Applied weights
 * flow through getActiveWeights(); dismissing the applied row restores the
 * byte-identical defaults.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** The reliability formula over a frozen dimensions snapshot: weighted
 *  positive part × the SAME fixed multiplicative penalties the live engine
 *  uses (penalties are never learned — they can only lower a score). */
export function scoreFromDimensions(dims: Record<string, number>, weights: ReliabilityWeights): number {
  const d = (k: string, fallback: number) => (typeof dims[k] === 'number' ? dims[k] : fallback)
  const positive =
    weights.authority * d('authority', 0.5) +
    weights.independence * d('independence', 0.5) +
    weights.support * d('support', 0.5) +
    weights.specificity * d('specificity', 0.5) +
    weights.freshness * d('freshness', 0.5) +
    weights.originTrace * d('originTrace', 0.5)
  return clamp01(
    positive * (1 - 0.5 * d('contradiction', 0)) * (1 - 0.4 * d('copyLoopRisk', 0)) * (1 - 0.3 * d('manipulationRisk', 0)),
  )
}

type BacktestRow = { dims: Record<string, number>; y: number }

export function meanBrier(rows: BacktestRow[], weights: ReliabilityWeights): number {
  if (rows.length === 0) return Number.POSITIVE_INFINITY
  const total = rows.reduce((sum, r) => sum + (scoreFromDimensions(r.dims, weights) - r.y) ** 2, 0)
  return total / rows.length
}

function normalise(w: ReliabilityWeights): ReliabilityWeights {
  const sum = WEIGHT_KEYS.reduce((a, k) => a + w[k], 0)
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, w[k] / sum])) as ReliabilityWeights
}

function withinBounds(w: ReliabilityWeights, start: ReliabilityWeights): boolean {
  return WEIGHT_KEYS.every(
    (k) => w[k] >= WEIGHT_FLOOR - 1e-9 && w[k] <= WEIGHT_CEIL + 1e-9 && Math.abs(w[k] - start[k]) <= MAX_WEIGHT_SHIFT + 1e-9,
  )
}

/** Deterministic bounded coordinate descent: fixed dimension order, ±0.01
 *  steps, renormalised to sum 1, candidate rejected if any bound or the
 *  per-dimension shift cap breaks. Same inputs → same output, always. */
export function searchWeights(
  rows: BacktestRow[],
  start: ReliabilityWeights,
): { weights: ReliabilityWeights; brier: number } {
  let best = { ...start }
  let bestBrier = meanBrier(rows, best)
  const STEP = 0.01
  for (let sweep = 0; sweep < 200; sweep++) {
    let improved = false
    for (const key of WEIGHT_KEYS) {
      for (const dir of [1, -1]) {
        const candidateRaw = { ...best, [key]: best[key] + dir * STEP }
        const candidate = normalise(candidateRaw)
        if (!withinBounds(candidate, start)) continue
        const brier = meanBrier(rows, candidate)
        if (brier < bestBrier - 1e-9) {
          best = candidate
          bestBrier = brier
          improved = true
        }
      }
    }
    if (!improved) break
  }
  return { weights: best, brier: bestBrier }
}

function parseDims(json: string): Record<string, number> | null {
  try {
    const d = JSON.parse(json)
    if (d && typeof d === 'object' && typeof d.authority === 'number') return d as Record<string, number>
  } catch {
    // malformed snapshot — row excluded from the backtest
  }
  return null
}

/** Computes a weight suggestion when the evidence base is big enough and the
 *  improvement is material. One live SUGGESTED row at a time. */
export async function maybeSuggestWeights(scanRunId: string): Promise<{ created: boolean; errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  try {
    const existing = await prisma.reliabilityWeightSuggestion.findFirst({ where: { status: 'SUGGESTED' } })
    if (existing) return { created: false, errors }

    const resolved = await prisma.outcomePrediction.findMany({
      where: { subjectKind: 'EVENT', status: 'RESOLVED', isFixture: false, outcome: { in: ['HAPPENED', 'DID_NOT_HAPPEN'] } },
    })
    const rows: BacktestRow[] = []
    for (const p of resolved) {
      const dims = parseDims(p.dimensionsJson)
      if (!dims) continue
      rows.push({ dims, y: p.outcome === 'HAPPENED' ? 1 : 0 })
    }
    if (rows.length < MIN_RESOLVED_FOR_LEARNING) return { created: false, errors }

    const current = await getActiveWeights()
    const currentBrier = meanBrier(rows, current)
    const { weights: suggested, brier: suggestedBrier } = searchWeights(rows, current)
    const improvement = currentBrier - suggestedBrier
    if (improvement < MIN_BRIER_IMPROVEMENT) return { created: false, errors }

    const rationale = WEIGHT_KEYS.filter((k) => Math.abs(suggested[k] - current[k]) >= 0.005).map(
      (k) =>
        `${k}: ${current[k].toFixed(3)} → ${suggested[k].toFixed(3)} (${suggested[k] > current[k] ? '+' : ''}${(suggested[k] - current[k]).toFixed(3)}) — ` +
        `backtest Brier improves ${improvement.toFixed(4)} on ${rows.length} resolved outcome(s)`,
    )

    await prisma.reliabilityWeightSuggestion.create({
      data: {
        scanRunId,
        basedOnResolvedCount: rows.length,
        currentWeightsJson: JSON.stringify(current),
        suggestedWeightsJson: JSON.stringify(suggested),
        expectedBrierImprovement: improvement,
        rationaleJson: JSON.stringify(rationale),
      },
    })
    return { created: true, errors }
  } catch (err) {
    errors.push({ stage: 'outcome:weight-learning', message: err instanceof Error ? err.message : String(err) })
    return { created: false, errors }
  }
}

/** Owner action: activate a suggestion. Any previously APPLIED row retires to
 *  DISMISSED — exactly one set of weights is ever active. */
export async function applyWeightSuggestion(id: string): Promise<void> {
  await prisma.reliabilityWeightSuggestion.updateMany({
    where: { status: 'APPLIED' },
    data: { status: 'DISMISSED' },
  })
  await prisma.reliabilityWeightSuggestion.update({
    where: { id },
    data: { status: 'APPLIED', appliedAt: new Date() },
  })
  clearWeightsCache()
}

/** Owner action: dismiss a suggestion (or retire the applied one — scoring
 *  then reverts to the byte-identical defaults). */
export async function dismissWeightSuggestion(id: string): Promise<void> {
  await prisma.reliabilityWeightSuggestion.update({ where: { id }, data: { status: 'DISMISSED' } })
  clearWeightsCache()
}
