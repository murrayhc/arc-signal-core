import { getGraphForRender, type RenderFilters } from '@/server/services/graph'

function parseFilters(searchParams: URLSearchParams): RenderFilters {
  const filters: RenderFilters = {}

  const nodeTypes = searchParams.get('nodeTypes')
  if (nodeTypes) filters.nodeTypes = nodeTypes.split(',').map((t) => t.trim()).filter(Boolean)

  const sector = searchParams.get('sector')
  if (sector) filters.sector = sector

  const region = searchParams.get('region')
  if (region) filters.region = region

  const minConfidence = searchParams.get('minConfidence')
  if (minConfidence !== null) {
    const parsed = Number(minConfidence)
    if (!Number.isNaN(parsed)) filters.minConfidence = parsed
  }

  if (searchParams.get('riskOnly') === 'true') filters.riskOnly = true
  if (searchParams.get('opportunityOnly') === 'true') filters.opportunityOnly = true

  const sinceDays = searchParams.get('sinceDays')
  if (sinceDays !== null) {
    const parsed = Number(sinceDays)
    if (!Number.isNaN(parsed)) filters.sinceDays = parsed
  }

  return filters
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const filters = parseFilters(searchParams)
  const result = await getGraphForRender(filters)
  return Response.json(result)
}
