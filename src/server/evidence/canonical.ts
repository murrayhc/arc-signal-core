import type { AtomicClaim, CanonicalClaim, ClaimCluster } from '@prisma/client'
import { prisma } from '@/server/db'
import { blendedSimilarity, COPY_THRESHOLD, MATCH_THRESHOLD, normalise } from './text'
import type { EvidenceError } from './types'

/** Two claims dated more than this far apart are treated as different events
 *  even if the wording matches. */
const MAX_DATE_GAP_DAYS = 45

function parseJsonArray(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function lowerSet(items: string[]): Set<string> {
  return new Set(items.map((s) => s.toLowerCase()))
}

function shareAny(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true
  return false
}

function dayGap(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

export type CanonicalAssignment = {
  created: CanonicalClaim[]
  updated: CanonicalClaim[]
  affectedCanonicalIds: string[]
  errors: EvidenceError[]
}

/** Groups atomic claims into canonical claims. Same claim type + text
 *  similarity, gated by entity / date / region compatibility. Different
 *  entities never merge. Creates a ClaimCluster per canonical claim and links
 *  each atomic claim back to its canonical. */
export async function assignCanonicalClaims(atomicClaims: AtomicClaim[]): Promise<CanonicalAssignment> {
  const created: CanonicalClaim[] = []
  const touched = new Set<string>()
  const errors: EvidenceError[] = []

  // Process earliest-first so the first-seen / origin canonical is stable.
  const ordered = [...atomicClaims].sort((a, b) => {
    const at = a.eventDate?.getTime() ?? a.createdAt.getTime()
    const bt = b.eventDate?.getTime() ?? b.createdAt.getTime()
    return at - bt
  })

  for (const atomic of ordered) {
    try {
      const norm = normalise(atomic.claimText)
      const entities = lowerSet(parseJsonArray(atomic.entitiesJson))
      const regions = lowerSet(parseJsonArray(atomic.regionsJson))

      const candidates = await prisma.canonicalClaim.findMany({
        where: { claimType: atomic.claimType, status: 'ACTIVE' },
      })

      let best: { canonical: CanonicalClaim; sim: number } | null = null
      for (const cand of candidates) {
        const sim = blendedSimilarity(norm, normalise(cand.claimText))
        if (sim < MATCH_THRESHOLD) continue
        const candAtomics = await prisma.atomicClaim.findMany({ where: { canonicalClaimId: cand.id } })
        const candEntities = lowerSet(candAtomics.flatMap((c) => parseJsonArray(c.entitiesJson)))
        // Different named entities ⇒ different claim, never merge.
        if (entities.size > 0 && candEntities.size > 0 && !shareAny(entities, candEntities)) continue
        // Different dates ⇒ different event unless close together.
        const gap = dayGap(atomic.eventDate, cand.firstSeenAt)
        if (gap !== null && gap > MAX_DATE_GAP_DAYS) continue
        // Different regions ⇒ merge only if the wording is near-identical.
        const candRegions = lowerSet(candAtomics.flatMap((c) => parseJsonArray(c.regionsJson)))
        if (regions.size > 0 && candRegions.size > 0 && !shareAny(regions, candRegions) && sim < COPY_THRESHOLD) continue
        if (!best || sim > best.sim) best = { canonical: cand, sim }
      }

      if (best) {
        await prisma.atomicClaim.update({
          where: { id: atomic.id },
          data: {
            canonicalClaimId: best.canonical.id,
            metadataJson: mergeMeta(atomic.metadataJson, { canonicalSim: Number(best.sim.toFixed(3)) }),
          },
        })
        const repeatCount = await prisma.atomicClaim.count({ where: { canonicalClaimId: best.canonical.id } })
        const updated = await prisma.canonicalClaim.update({
          where: { id: best.canonical.id },
          data: { repeatCount },
        })
        await upsertCluster(updated)
        touched.add(updated.id)
      } else {
        const canonical = await prisma.canonicalClaim.create({
          data: {
            claimText: atomic.claimText,
            normalisedClaimText: norm.normalised,
            claimType: atomic.claimType,
            firstSeenAt: atomic.eventDate,
            firstSeenSourceId: atomic.sourceId,
            repeatCount: 1,
            status: 'ACTIVE',
          },
        })
        await prisma.atomicClaim.update({ where: { id: atomic.id }, data: { canonicalClaimId: canonical.id } })
        await upsertCluster(canonical)
        created.push(canonical)
        touched.add(canonical.id)
      }
    } catch (err) {
      errors.push({ stage: 'canonical', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const createdIds = new Set(created.map((c) => c.id))
  const updatedIds = [...touched].filter((id) => !createdIds.has(id))
  const updated = await prisma.canonicalClaim.findMany({ where: { id: { in: updatedIds } } })
  return { created, updated, affectedCanonicalIds: [...touched], errors }
}

function mergeMeta(json: string, extra: Record<string, unknown>): string {
  let base: Record<string, unknown> = {}
  try {
    const j = JSON.parse(json)
    if (j && typeof j === 'object') base = j as Record<string, unknown>
  } catch {
    base = {}
  }
  return JSON.stringify({ ...base, ...extra })
}

async function upsertCluster(canonical: CanonicalClaim): Promise<ClaimCluster> {
  const atomics = await prisma.atomicClaim.findMany({ where: { canonicalClaimId: canonical.id } })
  const sourceCount = new Set(atomics.map((a) => a.sourceId)).size
  const title = canonical.claimText.slice(0, 80)
  const summary = `${atomics.length} report(s) of ${canonical.claimType}`
  return prisma.claimCluster.upsert({
    where: { canonicalClaimId: canonical.id },
    create: { canonicalClaimId: canonical.id, title, summary, sourceCount },
    update: { title, summary, sourceCount },
  })
}
