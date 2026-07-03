import { getEventGraphNodeId, getNodeNeighbourhood } from '@/server/services/graph'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const nodeId = await getEventGraphNodeId(id)
  if (!nodeId) return Response.json({ error: 'Event graph node not found' }, { status: 404 })
  const neighbourhood = await getNodeNeighbourhood(nodeId)
  if (!neighbourhood) return Response.json({ error: 'Event graph node not found' }, { status: 404 })
  // Evidence arc lands in Task 6; placeholder keeps the response shape stable for API consumers.
  return Response.json({ ...neighbourhood, arc: null })
}
