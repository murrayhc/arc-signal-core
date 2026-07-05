import { getClaimReliability } from '@/server/services/evidence-depth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await getClaimReliability(id)
  if (!result) return Response.json({ error: 'Canonical claim not found' }, { status: 404 })
  return Response.json(result)
}
