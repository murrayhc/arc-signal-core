import { prisma } from '@/server/db'
import { isNameableOrganisation, resolveEntityName } from '@/server/evidence/entities'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { upsertReviewItem } from './service'

/**
 * Review-item producers, run at the end of a scan over that scan's events.
 * Each turns a withheld-or-flagged pipeline outcome into a visible queue
 * item. All idempotent (stable dedupe keys), all fault-isolated by the caller.
 */

const LOW_IMPACT_CONFIDENCE = 0.4
const MANIPULATION_ALERT_AT = 0.3
const CONTRADICTION_SPIKE_AT = 2

function parseArr(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Signals quarantined this scan (recycled/contradicted claims withheld from
 *  events). The orchestrator passes them through — each becomes a review item
 *  so a human can approve the evidence back in or confirm the withholding. */
export async function produceQuarantineReviews(
  quarantined: { claimId: string; reason: string }[],
): Promise<number> {
  let n = 0
  for (const q of quarantined) {
    await upsertReviewItem({
      itemType: 'QUARANTINED_CLAIM',
      subjectKind: 'claim',
      subjectId: q.claimId,
      dedupeKey: `quarantine:${q.claimId}`,
      title: 'Claim withheld from events (recycled/contradicted evidence)',
      reason: q.reason,
      severity: 0.5,
      detail: { source: 'signal-quarantine' },
    })
    n++
  }
  return n
}

/** Per-event producers: low-confidence named impacts, ambiguous entity
 *  mentions, contradiction spikes, and copy-burst manipulation alerts. */
export async function produceEventReviews(eventId: string): Promise<number> {
  let n = 0

  // 1. Low-confidence NAMED company impacts — publicly naming a company on
  // thin evidence is exactly what a human should sign off.
  const namedImpacts = await prisma.companyImpact.findMany({
    where: { eventCandidateId: eventId, entityId: { not: null } },
  })
  for (const impact of namedImpacts) {
    if (impact.confidence >= LOW_IMPACT_CONFIDENCE) continue
    await upsertReviewItem({
      itemType: 'LOW_CONFIDENCE_IMPACT',
      subjectKind: 'companyImpact',
      subjectId: impact.id,
      dedupeKey: `low-impact:${impact.id}`,
      title: `Low-confidence named impact: ${impact.companyName}`,
      reason: `${impact.companyName} is named ${impact.impactType} at ${Math.round(impact.confidence * 100)}% confidence — below the ${Math.round(LOW_IMPACT_CONFIDENCE * 100)}% floor for a publicly named company.`,
      severity: 0.6,
      eventCandidateId: eventId,
      evidenceIds: parseArr(impact.evidenceIdsJson),
      detail: { companyName: impact.companyName, impactType: impact.impactType, confidence: impact.confidence },
    })
    n++
  }

  // 2. Ambiguous entity mentions the resolver could NOT classify but that
  // recur across the event's evidence — a candidate the gazetteer/alias table
  // may be missing (feeds Stage-5 curation via the reviewer).
  const eventCanonicalIds = await canonicalIdsForEvent(eventId)
  const eventAtomics = eventCanonicalIds.length
    ? await prisma.atomicClaim.findMany({
        where: { canonicalClaimId: { in: eventCanonicalIds } },
        select: { entitiesJson: true },
      })
    : []
  // Flag only genuinely UNKNOWN mentions that were EXCLUDED from named
  // impacts. Places/roles/people are CONFIDENTLY classified (not ambiguous)
  // and brand-shaped UNKNOWNs already became impacts — neither is a gap. What
  // remains is the true grey zone a reviewer can curate.
  const ambiguousCounts = new Map<string, number>()
  for (const a of eventAtomics) {
    for (const name of parseArr(a.entitiesJson)) {
      if (resolveEntityName(name).kind !== 'UNKNOWN') continue
      if (isNameableOrganisation(name)) continue
      ambiguousCounts.set(name, (ambiguousCounts.get(name) ?? 0) + 1)
    }
  }
  for (const [name, count] of ambiguousCounts) {
    if (count < 2) continue // recurring only — a one-off fragment is noise
    await upsertReviewItem({
      itemType: 'AMBIGUOUS_ENTITY',
      subjectKind: 'entity',
      subjectId: name,
      dedupeKey: `ambiguous-entity:${name.toLowerCase()}`,
      title: `Unclassified recurring mention: "${name}"`,
      reason: `"${name}" appears ${count}× in evidence but the resolver could not confirm it as an organisation, so it was excluded from named impacts. A reviewer can confirm it as a company (curating the alias/keyword tables) or dismiss it.`,
      severity: 0.35,
      eventCandidateId: eventId,
      detail: { mention: name, occurrences: count },
    })
    n++
  }

  // 3. Contradiction spike / manipulation alert on the event's canonical
  // claims — resolved via the event's evidence chain (the same path the
  // consequence engine uses), not the signal.canonicalClaimId link which may
  // be sparse.
  if (eventCanonicalIds.length > 0) {
    const claimClusters = await prisma.claimCluster.findMany({ where: { canonicalClaimId: { in: eventCanonicalIds } } })
    for (const cc of claimClusters) {
      if (cc.contradictionCount >= CONTRADICTION_SPIKE_AT) {
        await upsertReviewItem({
          itemType: 'CONTRADICTION_SPIKE',
          subjectKind: 'event',
          subjectId: eventId,
          dedupeKey: `contradiction:${cc.canonicalClaimId}`,
          title: 'Contradiction spike on event evidence',
          reason: `A claim behind this event has ${cc.contradictionCount} contradicting reports — the story is disputed. A reviewer should decide whether the event should stand, be escalated, or be dismissed.`,
          severity: 0.7,
          eventCandidateId: eventId,
          detail: { canonicalClaimId: cc.canonicalClaimId, contradictionCount: cc.contradictionCount },
        })
        n++
      }
      if (cc.manipulationRiskScore >= MANIPULATION_ALERT_AT) {
        await upsertReviewItem({
          itemType: 'MANIPULATION_ALERT',
          subjectKind: 'event',
          subjectId: eventId,
          dedupeKey: `manipulation:${cc.canonicalClaimId}`,
          title: 'Possible coordinated amplification',
          reason: `A claim behind this event shows a copy-burst pattern (risk ${cc.manipulationRiskScore.toFixed(2)}): many near-identical copies landed in a tight window. A reviewer should check whether this is organic pickup or a seeded campaign before the event drives output.`,
          severity: 0.75,
          eventCandidateId: eventId,
          detail: { canonicalClaimId: cc.canonicalClaimId, manipulationRiskScore: cc.manipulationRiskScore },
        })
        n++
      }
    }
  }

  return n
}
