import { z } from 'zod'
import { runInvestigation } from '@/server/evidence/investigation-loop'

const BodySchema = z.object({ query: z.string().min(2).max(200) })

/** The interrogate → investigate bridge: a searched term with thin graph
 *  coverage can be turned into a bounded live investigation — the loop
 *  searches the term via the active adapters, ingests what it finds into the
 *  evidence layer (atomic → canonical → lineage → reliability), then chases
 *  the produced claims. Dormant-honest when no adapter is enabled. */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Missing or invalid query', issues: parsed.error.issues }, { status: 400 })
  }
  const summary = await runInvestigation({ queryText: parsed.data.query })
  return Response.json(summary)
}
