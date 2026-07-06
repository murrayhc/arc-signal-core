import { enrichEventConsequence } from '@/server/consequence/enrich'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await enrichEventConsequence(id)
  return Response.json(result)
}
