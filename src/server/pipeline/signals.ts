import type { Claim, Document, Signal } from '@prisma/client'
import { prisma } from '@/server/db'
import type { Direction, SignalType } from '@/shared/enums'
import type { PipelineError } from './types'

const CONFIDENCE_FLOOR = 0.4

type SignalMapping = { signalType: SignalType; direction: Direction; strength: number }

/** Rule table v1: claimType → signal. Text-dependent claim types branch on claim text. */
export function mapClaimToSignal(claim: Claim): SignalMapping | null {
  switch (claim.claimType) {
    case 'LAYOFF_MENTION':
      return { signalType: 'LAYOFF_SIGNAL', direction: 'NEGATIVE', strength: 0.7 }
    case 'FUNDING_MENTION':
      return { signalType: 'FUNDING_SIGNAL', direction: 'POSITIVE', strength: 0.65 }
    case 'EXECUTIVE_CHANGE':
      return /\b(resign|step(?:s|ped)? down|depart|exit)/i.test(claim.claimText)
        ? { signalType: 'EXECUTIVE_EXIT', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'EXECUTIVE_HIRE', direction: 'POSITIVE', strength: 0.6 }
    case 'HIRING_CHANGE':
      return /\b(freeze|slowdown)\b/i.test(claim.claimText)
        ? { signalType: 'HIRING_SLOWDOWN', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'HIRING_ACCELERATION', direction: 'POSITIVE', strength: 0.6 }
    case 'REGULATORY_EVENT':
      return { signalType: 'REGULATORY_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
    case 'PROCUREMENT_EVENT':
      return { signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', strength: 0.7 }
    case 'SUPPLY_CHAIN_EVENT':
      return { signalType: 'SUPPLY_CHAIN_PRESSURE', direction: 'NEGATIVE', strength: 0.65 }
    case 'MARKET_DEMAND_EVENT':
      return { signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65 }
    case 'FINANCIAL_RESULT':
      return /\b(warning|fell|losses)\b/i.test(claim.claimText)
        ? { signalType: 'CASH_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'PRODUCT_MOMENTUM', direction: 'POSITIVE', strength: 0.6 }
    case 'LEGAL_EVENT':
      return { signalType: 'LEGAL_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
    default:
      return null
  }
}

export async function createSignals(
  claims: Claim[],
  docsById: Map<string, Document>,
): Promise<{ signals: Signal[]; errors: PipelineError[] }> {
  const signals: Signal[] = []
  const errors: PipelineError[] = []
  for (const claim of claims) {
    if (claim.extractionConfidence < CONFIDENCE_FLOOR) continue
    const mapping = mapClaimToSignal(claim)
    if (!mapping) continue
    const doc = docsById.get(claim.documentId)
    if (!doc) {
      errors.push({ stage: 'signals', message: `No document loaded for claim ${claim.id}` })
      continue
    }
    const existing = await prisma.signal.findUnique({ where: { claimId: claim.id } })
    if (existing) continue
    try {
      signals.push(
        await prisma.signal.create({
          data: {
            claimId: claim.id,
            documentId: doc.id,
            sourceId: doc.sourceId,
            entityId: claim.entityId,
            signalType: mapping.signalType,
            signalDate: claim.claimDate ?? doc.fetchedAt,
            confidence: claim.extractionConfidence,
            strength: mapping.strength,
            direction: mapping.direction,
            explanation: `Derived from ${claim.claimType} claim (rule v1): "${claim.claimText.slice(0, 120)}" → ${mapping.signalType} (${mapping.direction}), strength ${mapping.strength}, confidence ${claim.extractionConfidence.toFixed(2)}.`,
            sector: claim.sector,
            region: claim.region,
            isFixture: claim.isFixture,
          },
        }),
      )
    } catch (err) {
      errors.push({
        stage: 'signals',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { signals, errors }
}
