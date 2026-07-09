import type { AtomicClaim, CanonicalClaim, Claim, Document, Signal } from '@prisma/client'
import { prisma } from '@/server/db'
import { jaccard, normalise } from '@/server/evidence/text'
import type { Direction, SignalType } from '@/shared/enums'
import type { PipelineError } from './types'

const CONFIDENCE_FLOOR = 0.4

/** Factuality labels that disqualify a claim from driving events. A recycled
 *  or contradicted claim is quarantined: no signal is created, the claim is
 *  flagged for review, and the scan reports it — it never silently ships. */
const QUARANTINE_LABELS = new Set(['RECYCLED', 'CONTRADICTED'])

type SignalMapping = { signalType: SignalType; direction: Direction; strength: number }

/** Legacy claimType → the evidence layer's atomic claim type, for linking a
 *  signal to the canonical claim whose reliability should drive it. */
const ATOMIC_TYPE_FOR_CLAIM: Record<string, string> = {
  LAYOFF_MENTION: 'LAYOFF_SIGNAL',
  FUNDING_MENTION: 'FUNDING_SIGNAL',
  EXECUTIVE_CHANGE: 'EXECUTIVE_CHANGE',
  HIRING_CHANGE: 'HIRING_CHANGE',
  REGULATORY_EVENT: 'REGULATORY_PRESSURE',
  PROCUREMENT_EVENT: 'PROCUREMENT_ACTIVITY',
  SUPPLY_CHAIN_EVENT: 'SUPPLY_CHAIN_PRESSURE',
  MARKET_DEMAND_EVENT: 'DEMAND_SIGNAL',
  FINANCIAL_RESULT: 'MARKET_MOVEMENT',
  LEGAL_EVENT: 'LEGAL_EVENT',
}

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

type CanonicalLink = { canonical: CanonicalClaim; atomic: AtomicClaim }

/** Finds the canonical claim behind a legacy claim: atomic claims on the SAME
 *  document, preferring the mapped claim type, tie-broken by token overlap
 *  with the legacy claim text. Deterministic, no model. */
function linkToCanonical(
  claim: Claim,
  atomicsByDoc: Map<string, AtomicClaim[]>,
  canonicalById: Map<string, CanonicalClaim>,
): CanonicalLink | null {
  const candidates = (atomicsByDoc.get(claim.documentId) ?? []).filter((a) => a.canonicalClaimId)
  if (candidates.length === 0) return null
  const mappedType = ATOMIC_TYPE_FOR_CLAIM[claim.claimType]
  const typed = candidates.filter((a) => a.claimType === mappedType)
  const pool = typed.length > 0 ? typed : candidates
  const claimTokens = normalise(claim.claimText).tokens
  let best: AtomicClaim | null = null
  let bestOverlap = -1
  for (const a of pool) {
    const overlap = jaccard(claimTokens, normalise(a.claimText).tokens)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      best = a
    }
  }
  if (!best?.canonicalClaimId) return null
  const canonical = canonicalById.get(best.canonicalClaimId)
  return canonical ? { canonical, atomic: best } : null
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export async function createSignals(
  claims: Claim[],
  docsById: Map<string, Document>,
): Promise<{ signals: Signal[]; quarantined: { claimId: string; reason: string }[]; errors: PipelineError[] }> {
  const signals: Signal[] = []
  const quarantined: { claimId: string; reason: string }[] = []
  const errors: PipelineError[] = []

  // Load the evidence layer once for all claims in this batch: atomic claims
  // on these documents and their canonical claims (reliability + factuality).
  const docIds = [...new Set(claims.map((c) => c.documentId))]
  const atomics = docIds.length
    ? await prisma.atomicClaim.findMany({ where: { documentId: { in: docIds } } })
    : []
  const atomicsByDoc = new Map<string, AtomicClaim[]>()
  for (const a of atomics) {
    atomicsByDoc.set(a.documentId, [...(atomicsByDoc.get(a.documentId) ?? []), a])
  }
  const canonicalIds = [...new Set(atomics.map((a) => a.canonicalClaimId).filter((x): x is string => !!x))]
  const canonicals = canonicalIds.length
    ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } })
    : []
  const canonicalById = new Map(canonicals.map((c) => [c.id, c]))

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

    // ── The spine unification: signal confidence comes from the evidence
    // layer's reliability engine, not from a regex constant. ──
    const link = linkToCanonical(claim, atomicsByDoc, canonicalById)

    if (link && QUARANTINE_LABELS.has(link.canonical.factualityLabel)) {
      // Recycled/contradicted evidence never drives events. Flag the legacy
      // claim for review and report the quarantine — never silently drop.
      await prisma.claim.update({ where: { id: claim.id }, data: { needsReview: true } })
      quarantined.push({
        claimId: claim.id,
        reason: `${link.canonical.factualityLabel}: "${claim.claimText.slice(0, 100)}" (canonical ${link.canonical.id}, reliability ${link.canonical.reliabilityScore.toFixed(2)})`,
      })
      continue
    }

    // Reliability-weighted confidence: floor 0.25 (a claim that exists at all
    // carries some information) rising linearly with canonical reliability.
    // Unlinked claims (no evidence-layer coverage) keep the extraction
    // confidence — honest fallback, never a fabricated boost.
    const confidence = link
      ? clamp01(Math.round((0.25 + 0.75 * link.canonical.reliabilityScore) * 100) / 100)
      : claim.extractionConfidence
    const explanation = link
      ? `Derived from ${claim.claimType} claim: "${claim.claimText.slice(0, 120)}" → ${mapping.signalType} (${mapping.direction}), strength ${mapping.strength}. ` +
        `Confidence ${confidence.toFixed(2)} from evidence reliability ${link.canonical.reliabilityScore.toFixed(2)} ` +
        `(${link.canonical.factualityLabel}, ${link.canonical.independentSourceCount} independent publisher(s)).`
      : `Derived from ${claim.claimType} claim (rule v1): "${claim.claimText.slice(0, 120)}" → ${mapping.signalType} (${mapping.direction}), strength ${mapping.strength}, confidence ${claim.extractionConfidence.toFixed(2)} (no evidence-layer link).`

    try {
      signals.push(
        await prisma.signal.create({
          data: {
            claimId: claim.id,
            documentId: doc.id,
            sourceId: doc.sourceId,
            entityId: claim.entityId,
            canonicalClaimId: link?.canonical.id ?? null,
            signalType: mapping.signalType,
            signalDate: claim.claimDate ?? doc.fetchedAt,
            confidence,
            strength: mapping.strength,
            direction: mapping.direction,
            explanation,
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
  return { signals, quarantined, errors }
}
