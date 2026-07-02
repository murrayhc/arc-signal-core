import type { Signal, SignalCluster } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

export type ClusterWithSignals = SignalCluster & { memberSignals: Signal[] }

const SIGNAL_LABELS: Record<string, string> = {
  LAYOFF_SIGNAL: 'Layoff pressure',
  FUNDING_SIGNAL: 'Funding activity',
  EXECUTIVE_EXIT: 'Executive departures',
  EXECUTIVE_HIRE: 'Executive appointments',
  HIRING_ACCELERATION: 'Hiring acceleration',
  HIRING_SLOWDOWN: 'Hiring slowdown',
  CASH_PRESSURE: 'Cash pressure',
  LEGAL_PRESSURE: 'Legal pressure',
  REGULATORY_PRESSURE: 'Regulatory pressure',
  PROCUREMENT_INCREASE: 'Procurement growth',
  SUPPLY_CHAIN_PRESSURE: 'Supply chain pressure',
  DEMAND_SPIKE: 'Demand growth',
  PRODUCT_MOMENTUM: 'Product momentum',
}

export function clusterLabel(clusterType: string, sector: string | null, region: string | null): string {
  const base = SIGNAL_LABELS[clusterType] ?? clusterType
  const scope = sector ?? 'cross-sector'
  return region ? `${base} — ${scope} (${region})` : `${base} — ${scope}`
}

export function scoreCluster(members: Signal[]): {
  strength: number
  confidence: number
  diversityRatio: number
  distinctSources: number
} {
  const n = members.length
  const distinctSources = new Set(members.map((m) => m.sourceId)).size
  const avgStrength = members.reduce((sum, m) => sum + m.strength, 0) / n
  const avgConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / n
  const diversityRatio = n > 1 ? (distinctSources - 1) / (n - 1) : 0
  const strength = Math.min(1, avgStrength + 0.1 * (n - 1))
  let confidence = Math.min(
    0.95,
    avgConfidence * (0.75 + 0.25 * diversityRatio) + 0.05 * (distinctSources - 1),
  )
  if (n === 1) confidence *= 0.6 // single-signal penalty: one report is not corroboration
  return { strength, confidence: Math.round(confidence * 100) / 100, diversityRatio, distinctSources }
}

export async function clusterSignals(signals: Signal[]): Promise<{
  clusters: ClusterWithSignals[]
  errors: PipelineError[]
}> {
  const clusters: ClusterWithSignals[] = []
  const errors: PipelineError[] = []

  const groups = new Map<string, Signal[]>()
  for (const signal of signals) {
    const key = `${signal.signalType}|${signal.sector ?? 'any'}|${signal.region ?? 'any'}`
    groups.set(key, [...(groups.get(key) ?? []), signal])
  }

  for (const [key, members] of groups) {
    try {
      if (members.length === 1 && members[0].strength < 0.5) continue // single weak signal: no cluster
      const [clusterType, sectorKey, regionKey] = key.split('|')
      const sector = sectorKey === 'any' ? null : sectorKey
      const region = regionKey === 'any' ? null : regionKey
      const { strength, confidence, diversityRatio, distinctSources } = scoreCluster(members)
      const prior = await prisma.signalCluster.findFirst({
        where: { clusterType, sector, region, id: { notIn: clusters.map((c) => c.id) } },
      })
      const novelty = prior ? 0.4 : 0.9
      const explanation =
        `${members.length} ${clusterType} signal(s) across ${distinctSources} independent source(s) ` +
        `sharing sector=${sector ?? 'unspecified'}, region=${region ?? 'unspecified'}. ` +
        `Strength ${strength.toFixed(2)} (avg member strength + size bonus). ` +
        `Confidence ${confidence.toFixed(2)} (avg member confidence weighted by source diversity ` +
        `${diversityRatio.toFixed(2)}${members.length === 1 ? ', single-signal penalty applied' : ''}). ` +
        `Novelty ${novelty} (${prior ? 'similar cluster seen before' : 'first cluster of this shape'}).`
      const created = await prisma.signalCluster.create({
        data: {
          title: clusterLabel(clusterType, sector, region),
          clusterType,
          sector,
          region,
          strength,
          confidence,
          novelty,
          explanation,
          isFixture: members.every((m) => m.isFixture),
          signals: { create: members.map((m) => ({ signalId: m.id })) },
        },
      })
      clusters.push({ ...created, memberSignals: members })
    } catch (err) {
      errors.push({ stage: 'cluster', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { clusters, errors }
}
