import { z } from 'zod'
import { createWatchMarket, listWatchMarkets } from '@/server/watch/service'

const PostSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sectors: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  queryTerms: z.array(z.string()).optional(),
  active: z.boolean().optional(),
})

export async function GET() {
  return Response.json(await listWatchMarkets())
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid watch market', issues: parsed.error.issues }, { status: 400 })
  }
  const created = await createWatchMarket(parsed.data)
  return Response.json(created, { status: 201 })
}
