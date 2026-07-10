import { z } from 'zod'
import { decideReviewItem } from '@/server/review/service'
import { REVIEW_STATUSES } from '@/shared/enums'

const PatchSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  reviewerNote: z.string().max(2000).optional(),
})

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
    return Response.json({ error: 'Invalid decision', issues: parsed.error.issues }, { status: 400 })
  }
  const updated = await decideReviewItem(id, parsed.data.status, parsed.data.reviewerNote)
  if (!updated) return Response.json({ error: 'Review item not found' }, { status: 404 })
  return Response.json(updated)
}
