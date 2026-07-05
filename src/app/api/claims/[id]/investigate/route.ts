import { runInvestigation } from '@/server/evidence/investigation-loop'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const summary = await runInvestigation({ canonicalClaimId: id })
  return Response.json(summary)
}
