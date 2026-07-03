import { z } from 'zod'
import { interrogate } from '@/server/interrogate/service'

const QuerySchema = z.object({ q: z.string().min(1) })

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({ q: searchParams.get('q') ?? undefined })
  if (!parsed.success) {
    return Response.json({ error: 'Missing or invalid q', issues: parsed.error.issues }, { status: 400 })
  }
  const result = await interrogate(parsed.data.q)
  return Response.json(result)
}
