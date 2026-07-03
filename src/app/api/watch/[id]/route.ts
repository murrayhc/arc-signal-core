import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getWatchMarket, updateWatchMarket, deleteWatchMarket, resolveWatchMarket } from '@/server/watch/service'

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sectors: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  queryTerms: z.array(z.string()).optional(),
  active: z.boolean().optional(),
})

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)

  if (url.searchParams.get('resolve') === '1') {
    const resolved = await resolveWatchMarket(id)
    if (!resolved) return Response.json({ error: 'Watch market not found' }, { status: 404 })
    return Response.json(resolved)
  }

  const market = await getWatchMarket(id)
  if (!market) return Response.json({ error: 'Watch market not found' }, { status: 404 })
  return Response.json(market)
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
    const updated = await updateWatchMarket(id, parsed.data)
    if (!updated) return Response.json({ error: 'Watch market not found' }, { status: 404 })
    return Response.json(updated)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return Response.json({ error: 'A watch market with this name already exists' }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deleted = await deleteWatchMarket(id)
  if (!deleted) return Response.json({ error: 'Watch market not found' }, { status: 404 })
  return Response.json({ ok: true })
}
