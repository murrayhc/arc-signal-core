import { rebuildGraph } from '@/server/graph/builder'

export async function POST() {
  const result = await rebuildGraph()
  return Response.json(result)
}
