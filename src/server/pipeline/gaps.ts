import type { DataGap, EventCandidate, TriggerCondition } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const STALE_DAYS = 14

type TriggerTemplate = {
  signalType: string
  conditionText: string
  direction: 'RAISES' | 'LOWERS'
  probabilityImpact: number
  priority: number
}

const TRIGGER_TEMPLATES: Record<string, TriggerTemplate[]> = {
  LAYOFF_SIGNAL: [
    { signalType: 'HIRING_ACCELERATION', conditionText: 'If hiring resumes at the affected organisations, layoff risk should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
    { signalType: 'LAYOFF_SIGNAL', conditionText: 'If further independent layoff reports appear, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
  ],
  PROCUREMENT_INCREASE: [
    { signalType: 'PROCUREMENT_INCREASE', conditionText: 'If procurement notices continue rising, the opportunity score should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'MACRO_PRESSURE', conditionText: 'If budget cuts are announced for the buying bodies, the opportunity score should fall.', direction: 'LOWERS', probabilityImpact: -0.15, priority: 2 },
  ],
  REGULATORY_PRESSURE: [
    { signalType: 'REGULATORY_PRESSURE', conditionText: 'If formal rules or fines are announced, severity and confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'REGULATORY_PRESSURE', conditionText: 'If the inquiry closes without action, risk should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
  ],
  DEMAND_SPIKE: [
    { signalType: 'DEMAND_SPIKE', conditionText: 'If demand growth is corroborated by additional independent sources, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'SUPPLY_CHAIN_PRESSURE', conditionText: 'If supply constraints emerge, realised opportunity should fall.', direction: 'LOWERS', probabilityImpact: -0.1, priority: 2 },
  ],
  CASH_PRESSURE: [
    { signalType: 'FUNDING_SIGNAL', conditionText: 'If fresh funding is announced, cash pressure should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
    { signalType: 'CASH_PRESSURE', conditionText: 'If further financial-strain reports appear, risk should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
  ],
}

const FALLBACK_TEMPLATES: TriggerTemplate[] = [
  { signalType: 'UNKNOWN', conditionText: 'If additional independent sources report the same pattern, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.15, priority: 2 },
  { signalType: 'UNKNOWN', conditionText: 'If no corroborating evidence appears within two weeks, confidence should fall.', direction: 'LOWERS', probabilityImpact: -0.15, priority: 2 },
]

export async function generateGapsAndTriggers(
  events: EventCandidate[],
  now: Date = new Date(),
): Promise<{ dataGaps: DataGap[]; triggerConditions: TriggerCondition[]; errors: PipelineError[] }> {
  const dataGaps: DataGap[] = []
  const triggerConditions: TriggerCondition[] = []
  const errors: PipelineError[] = []

  for (const event of events) {
    try {
      const clusters = await prisma.signalCluster.findMany({
        where: { eventCandidateId: event.id },
        include: { signals: { include: { signal: true } } },
      })
      const members = clusters.flatMap((c) => c.signals.map((link) => link.signal))

      if (members.length === 0) {
        errors.push({
          stage: 'gaps',
          message: `Event ${event.id} has no member signals; skipping gap and trigger analysis`,
        })
        continue
      }

      const distinctSources = new Set(members.map((m) => m.sourceId)).size
      const directions = new Set(members.map((m) => m.direction))
      const newest = Math.max(...members.map((m) => m.signalDate.getTime()))

      const gapSpecs: Omit<DataGap, 'id' | 'createdAt' | 'eventCandidateId'>[] = []
      if (distinctSources <= 1) {
        gapSpecs.push({ title: 'Single-source support', description: 'Only one source supports this event. Independent corroboration is missing, which materially limits confidence.', impactOnConfidence: -0.15, suggestedSourceCategory: 'NEWS', severity: 'HIGH' })
      }
      if (directions.size === 1) {
        gapSpecs.push({ title: 'No countervailing evidence', description: 'All supporting signals point the same way; no evidence against this event has been collected yet.', impactOnConfidence: -0.1, suggestedSourceCategory: 'NEWS', severity: 'MEDIUM' })
      }
      if (now.getTime() - newest > STALE_DAYS * 24 * 60 * 60 * 1000) {
        gapSpecs.push({ title: 'Evidence may be stale', description: `The newest supporting signal is older than ${STALE_DAYS} days. Conditions may have changed.`, impactOnConfidence: -0.1, suggestedSourceCategory: 'NEWS', severity: 'MEDIUM' })
      }
      if (!event.affectedSector) {
        gapSpecs.push({ title: 'Sector unresolved', description: 'No sector could be attributed from the evidence; scope of impact is unclear.', impactOnConfidence: -0.05, suggestedSourceCategory: 'OFFICIAL', severity: 'LOW' })
      }
      for (const spec of gapSpecs) {
        dataGaps.push(await prisma.dataGap.create({ data: { eventCandidateId: event.id, ...spec } }))
      }

      const templates = TRIGGER_TEMPLATES[event.eventType] ?? FALLBACK_TEMPLATES
      for (const t of templates) {
        triggerConditions.push(
          await prisma.triggerCondition.create({ data: { eventCandidateId: event.id, ...t } }),
        )
      }
    } catch (err) {
      errors.push({ stage: 'gaps', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { dataGaps, triggerConditions, errors }
}
