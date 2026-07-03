import { prisma } from '@/server/db'
import { getGraphForRender, getNodeNeighbourhood, type GraphEdgeData, type GraphNodeData, type RenderNode } from '@/server/services/graph'
import { classifyQuery } from '@/server/interrogate/classify'
import { getInstrumentContext, getCommodityContext, type SerializedCommodity, type SerializedInstrument } from '@/server/market/service'
import { getActiveMarketProvider } from '@/server/market/provider'
import type { MarketDataProvider, MarketQuote } from '@/server/market/types'
import type { QueryType } from '@/shared/enums'

export type MarketContext = {
  configured: boolean
  provider: string | null
  delayed: boolean
  instrument: SerializedInstrument | null
  commodity: SerializedCommodity | null
  quote: MarketQuote | null
  note: string
}

export type InterrogationResult = {
  query: string
  queryType: QueryType
  matchedNodeCount: number
  events: { id: string; title: string; eventClass: string; confidence: number; sector: string | null; region: string | null }[]
  opportunities: { id: string; title: string; opportunityType: string; commercialValueScore: number }[]
  contradictions: { aTitle: string; bTitle: string }[]
  sources: { id: string; name: string }[]
  positioning: { id: string; title: string; userType: string }[]
  subgraph: { nodes: RenderNode[]; edges: GraphEdgeData[] }
  marketContextAvailable: boolean
  disclaimer: string | null
  marketContext: MarketContext | null
}

export type InterrogateOptions = { marketProvider?: MarketDataProvider | null }

const MARKET_QUERY_TYPES: QueryType[] = ['TICKER', 'SHARE_PRICE', 'INSTRUMENT', 'COMMODITY']

export const MARKET_DISCLAIMER =
  'This query looks like a market/price lookup. Archlight does not provide live market data or pricing — ' +
  'this is not investment advice. Live market context is planned for a later phase; the results below are ' +
  'limited to whatever event-graph evidence already exists for this query, if any.'

/** The exact non-advisory disclaimer shown once a market provider is configured
 *  and marketContext is populated — verbatim per the phase 3e design doc §6. */
export const CONFIGURED_MARKET_DISCLAIMER =
  'This view provides public market context and strategic interpretation examples. It does not provide personal ' +
  'investment advice, portfolio advice, or buy, sell or hold recommendations.'

const NOT_CONFIGURED_MARKET_CONTEXT: MarketContext = {
  configured: false,
  provider: null,
  delayed: true,
  instrument: null,
  commodity: null,
  quote: null,
  note: 'market data provider not configured',
}

function toRenderNode(node: GraphNodeData): RenderNode {
  return { ...node, group: node.nodeType, val: 1 + node.impactScore * 4 }
}

/**
 * Resolve marketContext for a market-shaped query (TICKER/SHARE_PRICE/INSTRUMENT/
 * COMMODITY). Dormant (no provider) returns the exact not-configured sentinel —
 * byte-identical across every call, never fabricated. Configured routes COMMODITY
 * queries through getCommodityContext and everything else (TICKER/SHARE_PRICE/
 * INSTRUMENT all name a tradeable instrument) through getInstrumentContext,
 * both of which already run graph-evidence gathering + the advice-language guard.
 * Never throws: a missing profile/quote surfaces as configured:true with a null
 * instrument/commodity, not an error.
 */
async function resolveMarketContext(
  query: string,
  queryType: QueryType,
  provider: MarketDataProvider | null,
): Promise<MarketContext> {
  if (!provider) return NOT_CONFIGURED_MARKET_CONTEXT

  if (queryType === 'COMMODITY') {
    const ctx = await getCommodityContext(query, { provider })
    return {
      configured: ctx.configured,
      provider: ctx.provider,
      delayed: ctx.delayed,
      instrument: null,
      commodity: ctx.profile,
      quote: null,
      note: ctx.summary,
    }
  }

  const ctx = await getInstrumentContext(query, { provider })
  return {
    configured: ctx.configured,
    provider: ctx.provider,
    delayed: ctx.delayed,
    instrument: ctx.profile,
    commodity: null,
    quote: ctx.quote,
    note: ctx.summary,
  }
}

/**
 * Find GraphNodes matching the query: title contains the query (case-insensitive),
 * or — for SECTOR/REGION nodes — refId equals the lowercased query.
 */
async function findMatchingNodes(query: string) {
  const lower = query.toLowerCase()
  const allNodes = await prisma.graphNode.findMany()
  return allNodes.filter((n) => n.title.toLowerCase().includes(lower) || ((n.nodeType === 'SECTOR' || n.nodeType === 'REGION') && n.refId === lower))
}

/**
 * Deterministic query interrogation: classifies the query using known sectors/regions/
 * company names loaded from the DB, finds matching graph nodes (+1-degree neighbourhood),
 * and gathers connected events, opportunities, contradictions, sources and positioning
 * examples reachable from those EVENT nodes. Market-shaped queries (TICKER/SHARE_PRICE/
 * INSTRUMENT/COMMODITY): with no active market provider, `marketContextAvailable=false`
 * and `disclaimer=MARKET_DISCLAIMER` — UNCHANGED dormant default, byte-identical to
 * before this field existed — but any graph matches are still returned honestly. With
 * an active provider (`opts.marketProvider`, default resolved via
 * `getActiveMarketProvider()`), `marketContextAvailable=true`, `disclaimer` swaps to
 * the public-market-context non-advisory wording, and `marketContext` is populated
 * from the market service (which itself traverses the matched market node's graph
 * neighbourhood for connected events/sectors/contradictions — never fabricated).
 * Non-market queries always get `marketContext=null`, dormant or configured.
 * Never fabricates matches: no hits means empty arrays, not invented content.
 */
export async function interrogate(q: string, opts?: InterrogateOptions): Promise<InterrogationResult> {
  const query = q.trim()
  const marketProvider = opts && 'marketProvider' in opts ? (opts.marketProvider ?? null) : getActiveMarketProvider()

  const [sectorRows, regionRows, entityRows] = await Promise.all([
    prisma.eventCandidate.findMany({ where: { affectedSector: { not: null } }, distinct: ['affectedSector'], select: { affectedSector: true } }),
    prisma.eventCandidate.findMany({ where: { affectedRegion: { not: null } }, distinct: ['affectedRegion'], select: { affectedRegion: true } }),
    prisma.entity.findMany({ select: { name: true } }),
  ])
  const knownSectors = sectorRows.map((r) => r.affectedSector).filter((s): s is string => !!s)
  const knownRegions = regionRows.map((r) => r.affectedRegion).filter((r): r is string => !!r)
  const knownCompanies = entityRows.map((e) => e.name)

  const queryType = classifyQuery(query, { knownSectors, knownRegions, knownCompanies })

  const matchedNodes = query.length > 0 ? await findMatchingNodes(query) : []

  // Gather 1-degree neighbourhoods for every matched node.
  const subgraphNodeById = new Map<string, GraphNodeData>()
  const subgraphEdgeById = new Map<string, GraphEdgeData>()
  const eventNodeIds = new Set<string>()

  for (const node of matchedNodes) {
    const neighbourhood = await getNodeNeighbourhood(node.id)
    if (!neighbourhood) continue

    subgraphNodeById.set(neighbourhood.node.id, neighbourhood.node)
    if (neighbourhood.node.nodeType === 'EVENT') eventNodeIds.add(neighbourhood.node.id)

    for (const neighbour of neighbourhood.neighbours) {
      subgraphNodeById.set(neighbour.id, neighbour)
      if (neighbour.nodeType === 'EVENT') eventNodeIds.add(neighbour.id)
    }
    for (const edge of neighbourhood.edges) {
      subgraphEdgeById.set(edge.id, edge)
    }
  }

  // Also treat directly-matched EVENT nodes (even with no neighbours) as event hits.
  for (const node of matchedNodes) {
    if (node.nodeType === 'EVENT') eventNodeIds.add(node.id)
  }

  const eventCandidateIds = new Set<string>()
  if (eventNodeIds.size > 0) {
    const eventNodes = await prisma.graphNode.findMany({ where: { id: { in: [...eventNodeIds] } } })
    for (const n of eventNodes) {
      if (n.refType === 'event') eventCandidateIds.add(n.refId)
    }
  }

  const events =
    eventCandidateIds.size > 0
      ? await prisma.eventCandidate.findMany({
          where: { id: { in: [...eventCandidateIds] } },
          include: { opportunityCards: true, riskOpportunities: true, positioningExamples: true },
        })
      : []

  const eventSummaries = events.map((e) => ({
    id: e.id,
    title: e.title,
    eventClass: e.eventClass,
    confidence: e.confidence,
    sector: e.affectedSector,
    region: e.affectedRegion,
  }))

  const opportunities = events.flatMap((e) =>
    e.opportunityCards.map((c) => ({
      id: c.id,
      title: c.title,
      opportunityType: c.opportunityType,
      commercialValueScore: c.commercialValueScore,
    })),
  )

  const positioning = events.flatMap((e) =>
    e.positioningExamples.map((p) => ({ id: p.id, title: p.title, userType: p.userType })),
  )

  // Contradictions: CONTRADICTS edges between any of the matched events' EVENT nodes.
  const eventGraphNodeIds = eventCandidateIds.size > 0
    ? (await prisma.graphNode.findMany({ where: { refType: 'event', refId: { in: [...eventCandidateIds] } } })).map((n) => n.id)
    : []
  const contradictionEdges =
    eventGraphNodeIds.length > 0
      ? await prisma.graphEdge.findMany({
          where: {
            edgeType: 'CONTRADICTS',
            OR: [{ sourceNodeId: { in: eventGraphNodeIds } }, { targetNodeId: { in: eventGraphNodeIds } }],
          },
        })
      : []
  const contradictionNodeIds = new Set<string>()
  for (const edge of contradictionEdges) {
    contradictionNodeIds.add(edge.sourceNodeId)
    contradictionNodeIds.add(edge.targetNodeId)
  }
  const contradictionNodesById =
    contradictionNodeIds.size > 0
      ? new Map((await prisma.graphNode.findMany({ where: { id: { in: [...contradictionNodeIds] } } })).map((n) => [n.id, n]))
      : new Map()
  const contradictions = contradictionEdges
    .map((edge) => {
      const a = contradictionNodesById.get(edge.sourceNodeId)
      const b = contradictionNodesById.get(edge.targetNodeId)
      if (!a || !b) return null
      return { aTitle: a.title, bTitle: b.title }
    })
    .filter((c): c is { aTitle: string; bTitle: string } => c !== null)

  // SOURCE nodes reachable within the gathered subgraph.
  const sources = [...subgraphNodeById.values()]
    .filter((n) => n.nodeType === 'SOURCE')
    .map((n) => ({ id: n.id, name: n.title }))

  const isMarketQuery = MARKET_QUERY_TYPES.includes(queryType)
  const marketContext = isMarketQuery ? await resolveMarketContext(query, queryType, marketProvider) : null

  // Dormant default is byte-identical to before marketContext existed:
  // marketContextAvailable=false + MARKET_DISCLAIMER for every market-shaped query
  // with no provider. A configured provider flips marketContextAvailable=true and
  // swaps in the non-advisory public-market-context disclaimer. Non-market queries
  // are unaffected either way (marketContextAvailable=true, disclaimer=null).
  const marketContextAvailable = !isMarketQuery || marketContext?.configured === true
  const disclaimer = !isMarketQuery ? null : marketContext?.configured ? CONFIGURED_MARKET_DISCLAIMER : MARKET_DISCLAIMER

  return {
    query,
    queryType,
    matchedNodeCount: matchedNodes.length,
    events: eventSummaries,
    opportunities,
    contradictions,
    sources,
    positioning,
    subgraph: {
      nodes: [...subgraphNodeById.values()].map(toRenderNode),
      // Only edges whose BOTH endpoints are in the subgraph node set — a dangling
      // edge would crash the force-graph renderer ("node not found").
      edges: [...subgraphEdgeById.values()].filter(
        (e) => subgraphNodeById.has(e.sourceNodeId) && subgraphNodeById.has(e.targetNodeId),
      ),
    },
    marketContextAvailable,
    disclaimer,
    marketContext,
  }
}

// Re-exported so routes can build render filters alongside interrogation without a second import path.
export { getGraphForRender }
