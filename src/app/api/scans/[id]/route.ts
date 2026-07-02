import { prisma } from '@/server/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scanRun = await prisma.scanRun.findUnique({ where: { id } })
  if (!scanRun) return Response.json({ error: 'Scan run not found' }, { status: 404 })
  const { errorsJson, ...rest } = scanRun
  return Response.json({ ...rest, errors: JSON.parse(errorsJson) })
}
