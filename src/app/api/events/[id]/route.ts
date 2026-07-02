import { z } from 'zod'
import { getEventDetail, updateEventStatus } from '@/server/services/events'

const PatchSchema = z.object({ action: z.enum(['ESCALATE', 'DISMISS', 'NEEDS_REVIEW']) })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getEventDetail(id)
  if (!detail) return Response.json({ error: 'Event not found' }, { status: 404 })
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
  const result = await updateEventStatus(id, parsed.data.action)
  if (!result) return Response.json({ error: 'Event not found' }, { status: 404 })
  return Response.json(result)
}
