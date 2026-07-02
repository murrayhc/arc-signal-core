import { getOpportunityRadar } from '@/server/services/opportunities'

export async function GET() {
  return Response.json(await getOpportunityRadar())
}
