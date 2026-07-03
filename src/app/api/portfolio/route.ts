import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { addToPortfolio, listPortfolio, PortfolioCardNotFoundError } from '@/server/portfolio/service'

const PostSchema = z.object({ opportunityCardId: z.string().min(1) })

export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  return Response.json(await listPortfolio(status ? { status } : undefined))
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PostSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'opportunityCardId is required', issues: parsed.error.issues }, { status: 400 })
  }

  const { opportunityCardId } = parsed.data
  const alreadyExists = (await prisma.opportunityPortfolioItem.findUnique({ where: { opportunityCardId } })) !== null

  try {
    const item = await addToPortfolio(opportunityCardId)
    return Response.json(item, { status: alreadyExists ? 200 : 201 })
  } catch (err) {
    if (err instanceof PortfolioCardNotFoundError) {
      return Response.json({ error: 'Opportunity card not found' }, { status: 404 })
    }
    // P2002 race: another request created the item between the existence check above and
    // this route's own create (via addToPortfolio). Re-calling addToPortfolio now takes its
    // own already-exists early-return path, so the response is properly serialized and never
    // an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await addToPortfolio(opportunityCardId)
      return Response.json(existing, { status: 200 })
    }
    throw err
  }
}
