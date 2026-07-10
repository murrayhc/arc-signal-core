import { z } from 'zod'
import { decideReviewItem } from '@/server/review/service'
import { applyReviewVerdict } from '@/server/outcome/resolution'
import { REVIEW_STATUSES } from '@/shared/enums'

const PatchSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  reviewerNote: z.string().max(2000).optional(),
  // PREDICTION_RESOLUTION items only: the explicit outcome verdict. Defaults
  // from status (APPROVED → HAPPENED, REJECTED → DID_NOT_HAPPEN) when absent.
  verdict: z.enum(['HAPPENED', 'DID_NOT_HAPPEN', 'UNRESOLVABLE']).optional(),
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

  // A decided prediction-resolution item settles (or reopens) the prediction
  // itself — subjectId is the OutcomePrediction id.
  if (updated.itemType === 'PREDICTION_RESOLUTION') {
    const verdict =
      parsed.data.status === 'NEEDS_MORE_EVIDENCE'
        ? ('NEEDS_MORE_EVIDENCE' as const)
        : (parsed.data.verdict ?? (parsed.data.status === 'APPROVED' ? ('HAPPENED' as const) : ('DID_NOT_HAPPEN' as const)))
    await applyReviewVerdict(updated.subjectId, verdict, parsed.data.reviewerNote)
  }
  return Response.json(updated)
}
