import { prisma } from '@/server/db'
import { DEFAULT_WEIGHTS, getActiveWeights } from '@/server/evidence/weights'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [active, suggestions] = await Promise.all([
    getActiveWeights(),
    prisma.reliabilityWeightSuggestion.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  return Response.json({ defaults: DEFAULT_WEIGHTS, active, suggestions })
}
