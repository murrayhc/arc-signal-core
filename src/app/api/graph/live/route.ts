import { getLiveGraph } from '@/server/services/graph'

export async function GET() {
  const graph = await getLiveGraph()
  return Response.json(graph)
}
