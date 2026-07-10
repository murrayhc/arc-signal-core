import type { EventCandidate } from '@prisma/client'
import { prisma } from '@/server/db'

/**
 * Historic analogue retrieval — beyond "prior events of the same exact type".
 * Scores every earlier event by similarity to the current one (type, sector,
 * region, and NAMED-ENTITY overlap) and reports how those analogues actually
 * developed. Retrieval is over Archlight's own populated event corpus, so it
 * grows more useful as the radar runs — no fabricated history.
 */

export type HistoricAnalogue = {
  eventId: string
  title: string
  similarity: number
  status: string
  riskScore: number
  opportunityScore: number
  firstDetectedAt: Date
  sharedEntities: string[]
  basis: string
}

const W = { type: 0.4, sector: 0.25, region: 0.15, entities: 0.2 }

/** Named-organisation entities linked to an event (populated by Stage 5). */
async function eventEntityNames(eventId: string): Promise<Set<string>> {
  const links = await prisma.eventCandidateEntity.findMany({
    where: { eventCandidateId: eventId },
    select: { entity: { select: { canonicalKey: true, name: true } } },
  })
  return new Set(links.map((l) => l.entity.canonicalKey ?? l.entity.name.toLowerCase()))
}

/** Retrieves up to `limit` most-similar prior events, scored and explained. */
export async function findHistoricAnalogues(
  event: EventCandidate,
  limit = 3,
): Promise<HistoricAnalogue[]> {
  const priors = await prisma.eventCandidate.findMany({
    where: { id: { not: event.id }, firstDetectedAt: { lt: event.firstDetectedAt } },
    orderBy: { firstDetectedAt: 'desc' },
    take: 200, // recent window; scored below
  })
  if (priors.length === 0) return []

  const currentEntities = await eventEntityNames(event.id)

  const scored: HistoricAnalogue[] = []
  for (const prior of priors) {
    const typeMatch = prior.eventType === event.eventType ? 1 : 0
    const sectorMatch = event.affectedSector && prior.affectedSector === event.affectedSector ? 1 : 0
    const regionMatch = event.affectedRegion && prior.affectedRegion === event.affectedRegion ? 1 : 0

    const priorEntities = await eventEntityNames(prior.id)
    const shared = [...currentEntities].filter((e) => priorEntities.has(e))
    const entityOverlap =
      currentEntities.size > 0 && priorEntities.size > 0
        ? shared.length / Math.min(currentEntities.size, priorEntities.size)
        : 0

    const similarity =
      W.type * typeMatch + W.sector * sectorMatch + W.region * regionMatch + W.entities * entityOverlap
    if (similarity <= 0) continue

    const basisParts: string[] = []
    if (typeMatch) basisParts.push('same event type')
    if (sectorMatch) basisParts.push('same sector')
    if (regionMatch) basisParts.push('same region')
    if (shared.length) basisParts.push(`${shared.length} shared named entity(ies)`)

    scored.push({
      eventId: prior.id,
      title: prior.title,
      similarity: Math.round(similarity * 100) / 100,
      status: prior.status,
      riskScore: prior.riskScore,
      opportunityScore: prior.opportunityScore,
      firstDetectedAt: prior.firstDetectedAt,
      sharedEntities: shared,
      basis: basisParts.join(', ') || 'weak similarity',
    })
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
}

/** Human-readable historic context line built from retrieved analogues. */
export function describeAnalogues(analogues: HistoricAnalogue[], eventType: string, sector: string | null): string {
  const kind = eventType.replace(/_/g, ' ').toLowerCase()
  if (analogues.length === 0) {
    return `No comparable ${kind} pattern is recorded in Archlight's history${sector ? ` for ${sector}` : ''}.`
  }
  const top = analogues[0]
  const pct = (n: number) => `${Math.round(n * 100)}%`
  return (
    `Archlight has ${analogues.length} comparable pattern(s) on record. The closest (${pct(top.similarity)} similar — ${top.basis}) ` +
    `is currently ${top.status.toLowerCase()} at risk ${pct(top.riskScore)} / opportunity ${pct(top.opportunityScore)}. ` +
    `Compare this event's early signals against how those analogues developed.`
  )
}
