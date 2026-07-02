import { getSources } from '@/server/services/dashboard'

export async function GET() {
  return Response.json(await getSources())
}
