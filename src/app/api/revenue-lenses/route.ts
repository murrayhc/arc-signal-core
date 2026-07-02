import { getRevenueLenses } from '@/server/services/opportunities'

export async function GET() {
  return Response.json(await getRevenueLenses())
}
