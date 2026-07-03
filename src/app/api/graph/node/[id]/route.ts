import { getNodeNeighbourhood } from '@/server/services/graph'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const neighbourhood = await getNodeNeighbourhood(id)
  if (!neighbourhood) return Response.json({ error: 'Graph node not found' }, { status: 404 })
  return Response.json(neighbourhood)
}
