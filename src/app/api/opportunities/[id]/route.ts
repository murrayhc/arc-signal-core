import { z } from 'zod'
import { getOpportunityDetail, updateOpportunityStatus } from '@/server/services/opportunities'

const PatchSchema = z.object({ action: z.enum(['ESCALATE', 'DISMISS', 'ACTION']) })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getOpportunityDetail(id)
  if (!detail) return Response.json({ error: 'Opportunity not found' }, { status: 404 })
  return Response.json(detail)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid action', issues: parsed.error.issues }, { status: 400 })
  }
  const result = await updateOpportunityStatus(id, parsed.data.action)
  if (!result) return Response.json({ error: 'Opportunity not found' }, { status: 404 })
  return Response.json(result)
}
