import { getTrackRecord } from '@/server/services/outcome'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await getTrackRecord()
  return Response.json(data)
}
