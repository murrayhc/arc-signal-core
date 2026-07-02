import { getDashboardData } from '@/server/services/dashboard'

export async function GET() {
  const { sources } = await getDashboardData()
  return Response.json(sources)
}
