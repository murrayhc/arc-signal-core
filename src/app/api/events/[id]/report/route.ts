import { z } from 'zod'
import { REPORT_TYPES } from '@/shared/enums'
import { assembleReport } from '@/server/consequence/report'

const BodySchema = z.object({ reportType: z.enum(REPORT_TYPES) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid reportType', issues: parsed.error.issues }, { status: 400 })
  }
  const report = await assembleReport(id, parsed.data.reportType)
  if (!report) return Response.json({ error: 'Event not found' }, { status: 404 })
  return Response.json(report)
}
