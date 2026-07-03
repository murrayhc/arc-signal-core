import { prisma } from '@/server/db'
import { upsertNode, upsertEdge, type UpsertEdgeData } from '@/server/graph/builder'
import type { PipelineError } from '@/server/pipeline/types'

/** Look up a previously-upserted GraphNode id by its (refType, refId) unique.
 *  Local copy of builder.ts's private findNodeId — that helper isn't exported,
 *  and this module intentionally stays separate from builder.ts (which is
 *  already over its 500-line budget). Returns null if missing. */
async function findNodeId(refType: string, refId: string): Promise<string | null> {
  const node = await prisma.graphNode.findUnique({ where: { refType_refId: { refType, refId } } })
  return node?.id ?? null
}

/** Upsert an edge, guarding against self-edges and missing endpoints (never
 *  creates the endpoint — only links to a node that already exists). Local
 *  copy of builder.ts's private safeUpsertEdge, same reasoning as findNodeId
 *  above. Returns 1 if an edge was written, 0 otherwise. */
async function safeUpsertEdge(
  sourceNodeId: string | null,
  targetNodeId: string | null,
  edgeType: string,
  data: UpsertEdgeData,
): Promise<number> {
  if (!sourceNodeId || !targetNodeId) return 0
  if (sourceNodeId === targetNodeId) return 0
  await upsertEdge(sourceNodeId, targetNodeId, edgeType, data)
  return 1
}

/**
 * Project every InstrumentProfile into an INSTRUMENT GraphNode and every
 * CommodityProfile into a COMMODITY GraphNode, upsert-deduped on
 * (refType, refId) exactly like every other projection in builder.ts.
 * Returns the count of node upserts (create or update both count).
 */
async function projectMarketNodes(): Promise<number> {
  let count = 0

  const instruments = await prisma.instrumentProfile.findMany()
  for (const profile of instruments) {
    await upsertNode('instrument', profile.id, {
      nodeType: 'INSTRUMENT',
      title: profile.name,
      isFixture: profile.isFixture,
      metadata: { instrumentProfileId: profile.id, symbol: profile.symbol },
    })
    count++
  }

  const commodities = await prisma.commodityProfile.findMany()
  for (const profile of commodities) {
    await upsertNode('commodity', profile.id, {
      nodeType: 'COMMODITY',
      title: profile.name,
      isFixture: profile.isFixture,
      metadata: { commodityProfileId: profile.id, symbol: profile.symbol },
    })
    count++
  }

  return count
}

/**
 * Project edges from market nodes to already-existing graph nodes ONLY —
 * never fabricates the endpoint. Region/sector names on a commodity profile
 * won't always match an event-derived node; when they don't, the edge is
 * simply not created (expected, not an error):
 *  - COMMODITY -SUPPLIED_BY-> REGION, one per keySupplyRegions entry (lowercased,
 *    matched against a `region` node).
 *  - COMMODITY -AFFECTS-> SECTOR, one per keyDemandSectors entry (matched against
 *    a `sector` node).
 *  - INSTRUMENT -LINKED_TO-> COMPANY, best-effort: an entity/COMPANY node whose
 *    title exactly equals the instrument's name (case-insensitive); skipped
 *    when no such company node exists.
 * Returns the count of edges actually written.
 */
async function projectMarketEdges(): Promise<number> {
  let count = 0

  const commodities = await prisma.commodityProfile.findMany()
  for (const profile of commodities) {
    const commodityNodeId = await findNodeId('commodity', profile.id)
    if (!commodityNodeId) continue

    const supplyRegions = JSON.parse(profile.keySupplyRegionsJson) as string[]
    for (const region of supplyRegions) {
      const regionNodeId = await findNodeId('region', region.toLowerCase())
      count += await safeUpsertEdge(commodityNodeId, regionNodeId, 'SUPPLIED_BY', {
        label: `${profile.name} supplied by ${region}`,
        confidence: 0.6,
      })
    }

    const demandSectors = JSON.parse(profile.keyDemandSectorsJson) as string[]
    for (const sector of demandSectors) {
      const sectorNodeId = await findNodeId('sector', sector.toLowerCase())
      count += await safeUpsertEdge(commodityNodeId, sectorNodeId, 'AFFECTS', {
        label: `${profile.name} affects ${sector}`,
        confidence: 0.6,
      })
    }
  }

  const instruments = await prisma.instrumentProfile.findMany()
  if (instruments.length > 0) {
    // Loaded once outside the loop — a case-insensitive exact title match against
    // every existing COMPANY node, not a per-instrument query (SQLite has no
    // case-insensitive equality at the query-engine level, same convention as
    // interrogate/service.ts's findMatchingNodes / market/service.ts's gatherGraphEvidence).
    const companyNodes = await prisma.graphNode.findMany({ where: { nodeType: 'COMPANY' } })
    const companyNodeByLowerTitle = new Map(companyNodes.map((n) => [n.title.toLowerCase(), n.id]))

    for (const profile of instruments) {
      const instrumentNodeId = await findNodeId('instrument', profile.id)
      if (!instrumentNodeId) continue

      const companyNodeId = companyNodeByLowerTitle.get(profile.name.toLowerCase()) ?? null
      count += await safeUpsertEdge(instrumentNodeId, companyNodeId, 'LINKED_TO', {
        label: `${profile.name} linked to matching company record`,
        confidence: 0.5,
      })
    }
  }

  return count
}

/**
 * Sync COMMODITY/INSTRUMENT graph nodes + their edges from InstrumentProfile/
 * CommodityProfile rows. Additive and idempotent: fires only when profiles
 * exist (zero profiles -> zero nodes/edges, no regression to the pre-market
 * baseline), and re-running never duplicates a node or edge (both are upserts
 * keyed on stable unique constraints, matching every other projection in
 * builder.ts). This is the single market-projection entrypoint, called once
 * from builder.ts's syncGraphForEvents after the event node+edge passes.
 */
export async function syncMarketNodes(
  _now: Date = new Date(),
): Promise<{ nodeCount: number; edgeCount: number; errors: PipelineError[] }> {
  const errors: PipelineError[] = []
  let nodeCount = 0
  let edgeCount = 0

  try {
    nodeCount = await projectMarketNodes()
    edgeCount = await projectMarketEdges()
  } catch (err) {
    errors.push({ stage: 'graph:market', message: err instanceof Error ? err.message : String(err) })
  }

  return { nodeCount, edgeCount, errors }
}
