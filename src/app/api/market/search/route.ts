import { z } from 'zod'
import { searchMarket } from '@/server/market/service'

const QuerySchema = z.object({ q: z.string().min(1) })

/** GET /api/market/search?q= — dormant (no active provider) persists the
 *  query and returns { configured:false, results:[] }; never fabricates a
 *  result and never leaks the API key. Configured queries the active
 *  provider (boundary-validated, advice-guard-checked) via searchMarket. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const parsed = QuerySchema.safeParse({ q: searchParams.get('q') ?? undefined })
  if (!parsed.success) {
    return Response.json({ error: 'Missing or invalid q', issues: parsed.error.issues }, { status: 400 })
  }
  const result = await searchMarket(parsed.data.q)
  return Response.json(result)
}
