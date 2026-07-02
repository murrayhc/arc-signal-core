import { getScanHistory } from '@/server/services/scans'

export async function GET() {
  return Response.json(await getScanHistory())
}
