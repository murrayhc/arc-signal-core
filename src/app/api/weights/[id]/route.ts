import { z } from 'zod'
import { prisma } from '@/server/db'
import { applyWeightSuggestion, dismissWeightSuggestion } from '@/server/outcome/weight-learning'

const PostSchema = z.object({ action: z.enum(['APPLY', 'DISMISS']) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid action', issues: parsed.error.issues }, { status: 400 })
  }
  const suggestion = await prisma.reliabilityWeightSuggestion.findUnique({ where: { id } })
  if (!suggestion) return Response.json({ error: 'Suggestion not found' }, { status: 404 })

  if (parsed.data.action === 'APPLY') await applyWeightSuggestion(id)
  else await dismissWeightSuggestion(id)

  const updated = await prisma.reliabilityWeightSuggestion.findUnique({ where: { id } })
  return Response.json(updated)
}
