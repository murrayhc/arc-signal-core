import { getDashboardData } from '@/server/services/dashboard'

export async function GET() {
  return Response.json(await getDashboardData())
}
