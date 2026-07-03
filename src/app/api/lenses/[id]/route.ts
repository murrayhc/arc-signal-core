import { z } from 'zod'
import {
  getLens,
  updateLens,
  deleteLens,
  InvalidLensFieldError,
  DefaultLensDeletionError,
} from '@/server/lens/service'

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lens = await getLens(id)
  if (!lens) return Response.json({ error: 'Lens not found' }, { status: 404 })
  return Response.json(lens)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid patch', issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const updated = await updateLens(id, parsed.data)
    if (!updated) return Response.json({ error: 'Lens not found' }, { status: 404 })
    return Response.json(updated)
  } catch (err) {
    if (err instanceof InvalidLensFieldError) {
      return Response.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const deleted = await deleteLens(id)
    if (!deleted) return Response.json({ error: 'Lens not found' }, { status: 404 })
    return Response.json({ ok: true })
  } catch (err) {
    if (err instanceof DefaultLensDeletionError) {
      return Response.json({ error: err.message }, { status: 409 })
    }
    throw err
  }
}
