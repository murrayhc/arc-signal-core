import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { createLens, listLenses, InvalidLensFieldError } from '@/server/lens/service'

const PostSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  userType: z.string().optional(),
  targetSectors: z.array(z.string()).optional(),
  targetRegions: z.array(z.string()).optional(),
  offerTypes: z.array(z.string()).optional(),
  buyerPersonas: z.array(z.string()).optional(),
  averageDealSize: z.string().nullable().optional(),
  salesCycle: z.string().nullable().optional(),
  excludedSectors: z.array(z.string()).optional(),
  riskAppetite: z.string().optional(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export async function GET() {
  return Response.json(await listLenses())
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
    return Response.json({ error: 'Invalid lens', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const created = await createLens(parsed.data)
    return Response.json(created, { status: 201 })
  } catch (err) {
    if (err instanceof InvalidLensFieldError) {
      return Response.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return Response.json({ error: 'A lens with this name already exists' }, { status: 409 })
    }
    throw err
  }
}
