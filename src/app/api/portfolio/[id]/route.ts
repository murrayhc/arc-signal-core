import { z } from 'zod'
import { getPortfolioItem, updatePortfolioItem, InvalidPortfolioStatusError } from '@/server/portfolio/service'

const PatchSchema = z.object({
  status: z.string().optional(),
  owner: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  estimatedValue: z.string().nullable().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getPortfolioItem(id)
  if (!item) return Response.json({ error: 'Portfolio item not found' }, { status: 404 })
  return Response.json(item)
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
    return Response.json({ error: 'Invalid patch', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const updated = await updatePortfolioItem(id, parsed.data)
    if (!updated) return Response.json({ error: 'Portfolio item not found' }, { status: 404 })
    return Response.json(updated)
  } catch (err) {
    if (err instanceof InvalidPortfolioStatusError) {
      return Response.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
