import { getEventBeneficiaries } from '@/server/services/consequence'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return Response.json(await getEventBeneficiaries(id))
}
