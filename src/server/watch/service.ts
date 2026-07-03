import { prisma } from '@/server/db'

function parseJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export type WatchMarketData = {
  id: string
  name: string
  description: string | null
  sectors: string[]
  regions: string[]
  themes: string[]
  queryTerms: string[]
  active: boolean
  createdAt: string
  updatedAt: string
}

type WatchMarketRow = {
  id: string
  name: string
  description: string | null
  sectorsJson: string
  regionsJson: string
  themesJson: string
  queryTermsJson: string
  active: boolean
  createdAt: Date
  updatedAt: Date
}

function toWatchMarketData(row: WatchMarketRow): WatchMarketData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sectors: parseJsonArray(row.sectorsJson),
    regions: parseJsonArray(row.regionsJson),
    themes: parseJsonArray(row.themesJson),
    queryTerms: parseJsonArray(row.queryTermsJson),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type CreateWatchMarketInput = {
  name: string
  description?: string | null
  sectors?: string[]
  regions?: string[]
  themes?: string[]
  queryTerms?: string[]
  active?: boolean
}

export async function createWatchMarket(input: CreateWatchMarketInput): Promise<WatchMarketData> {
  const row = await prisma.watchMarket.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      sectorsJson: JSON.stringify(input.sectors ?? []),
      regionsJson: JSON.stringify(input.regions ?? []),
      themesJson: JSON.stringify(input.themes ?? []),
      queryTermsJson: JSON.stringify(input.queryTerms ?? []),
      active: input.active ?? true,
    },
  })
  return toWatchMarketData(row)
}

export async function listWatchMarkets(): Promise<WatchMarketData[]> {
  const rows = await prisma.watchMarket.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(toWatchMarketData)
}

export async function getWatchMarket(id: string): Promise<WatchMarketData | null> {
  const row = await prisma.watchMarket.findUnique({ where: { id } })
  return row ? toWatchMarketData(row) : null
}

export type UpdateWatchMarketInput = Partial<{
  name: string
  description: string | null
  sectors: string[]
  regions: string[]
  themes: string[]
  queryTerms: string[]
  active: boolean
}>

export async function updateWatchMarket(id: string, patch: UpdateWatchMarketInput): Promise<WatchMarketData | null> {
  const existing = await prisma.watchMarket.findUnique({ where: { id } })
  if (!existing) return null

  const row = await prisma.watchMarket.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.sectors !== undefined ? { sectorsJson: JSON.stringify(patch.sectors) } : {}),
      ...(patch.regions !== undefined ? { regionsJson: JSON.stringify(patch.regions) } : {}),
      ...(patch.themes !== undefined ? { themesJson: JSON.stringify(patch.themes) } : {}),
      ...(patch.queryTerms !== undefined ? { queryTermsJson: JSON.stringify(patch.queryTerms) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    },
  })
  return toWatchMarketData(row)
}

export async function deleteWatchMarket(id: string): Promise<boolean> {
  const existing = await prisma.watchMarket.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.watchMarket.delete({ where: { id } })
  return true
}

export type ResolvedWatchMarket = {
  market: WatchMarketData
  events: { id: string; title: string; eventClass: string; confidence: number; sector: string | null; region: string | null }[]
  opportunities: { id: string; title: string; opportunityType: string; commercialValueScore: number }[]
}

/**
 * Match the market's saved scope (sectors/regions/themes/queryTerms) against
 * existing EventCandidates. SQLite has no case-insensitive `mode`, so this
 * fetches all events then filters in JS (same convention as
 * `src/server/interrogate/service.ts`). A query term matches if it appears
 * (case-insensitively) in the event title or summary — reusing the same
 * "contains" shape the interrogation classifier/service already use for
 * theme/company matching. Themes are matched the same way as query terms
 * (there's no dedicated theme column on EventCandidate to compare against).
 * An empty scope (no sectors/regions/themes/queryTerms) never fabricates a
 * match — it returns empty arrays, even if events exist in the DB.
 */
export async function resolveWatchMarket(id: string): Promise<ResolvedWatchMarket | null> {
  const market = await getWatchMarket(id)
  if (!market) return null

  const hasScope =
    market.sectors.length > 0 || market.regions.length > 0 || market.themes.length > 0 || market.queryTerms.length > 0

  if (!hasScope) {
    return { market, events: [], opportunities: [] }
  }

  const sectorsLower = market.sectors.map((s) => s.toLowerCase())
  const regionsLower = market.regions.map((r) => r.toLowerCase())
  const termsLower = [...market.themes, ...market.queryTerms].map((t) => t.toLowerCase())

  const allEvents = await prisma.eventCandidate.findMany({ include: { opportunityCards: true } })

  const matchedEvents = allEvents.filter((e) => {
    const sectorMatch = e.affectedSector !== null && sectorsLower.includes(e.affectedSector.toLowerCase())
    const regionMatch = e.affectedRegion !== null && regionsLower.includes(e.affectedRegion.toLowerCase())
    const haystack = `${e.title} ${e.summary}`.toLowerCase()
    const termMatch = termsLower.some((term) => term.length > 0 && haystack.includes(term))
    return sectorMatch || regionMatch || termMatch
  })

  const events = matchedEvents.map((e) => ({
    id: e.id,
    title: e.title,
    eventClass: e.eventClass,
    confidence: e.confidence,
    sector: e.affectedSector,
    region: e.affectedRegion,
  }))

  const opportunities = matchedEvents.flatMap((e) =>
    e.opportunityCards.map((c) => ({
      id: c.id,
      title: c.title,
      opportunityType: c.opportunityType,
      commercialValueScore: c.commercialValueScore,
    })),
  )

  return { market, events, opportunities }
}
