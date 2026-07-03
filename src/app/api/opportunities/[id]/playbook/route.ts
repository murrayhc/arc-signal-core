import { prisma } from '@/server/db'
import { generatePlaybook, exportMarkdown, exportJson } from '@/server/playbook/service'
import { getPlaybookData } from '@/server/services/playbook'

async function cardExists(id: string): Promise<boolean> {
  const card = await prisma.opportunityCard.findUnique({ where: { id }, select: { id: true } })
  return card !== null
}

/** GET generates-if-absent and returns the serialized playbook.
 *  ?format=json returns the same export shape as a plain JSON body (explicit
 *  export, for parity with ?format=md).
 *  ?format=md returns the markdown export as text/markdown. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await cardExists(id))) {
    return Response.json({ error: 'Opportunity not found' }, { status: 404 })
  }

  let data = await getPlaybookData(id)
  if (!data) {
    const generated = await generatePlaybook(id)
    data = exportJson(generated)
  }

  const format = new URL(req.url).searchParams.get('format')
  if (format === 'md') {
    const playbook = await prisma.opportunityPlaybook.findUniqueOrThrow({ where: { opportunityCardId: id } })
    return new Response(exportMarkdown(playbook), { headers: { 'content-type': 'text/markdown' } })
  }
  if (format === 'json') {
    return Response.json(data)
  }

  return Response.json(data)
}

/** POST regenerates the playbook (deterministic baseline rebuilt, then a
 *  fresh LLM-upgrade attempt if a provider is active) and returns it. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await cardExists(id))) {
    return Response.json({ error: 'Opportunity not found' }, { status: 404 })
  }
  const generated = await generatePlaybook(id)
  return Response.json(exportJson(generated))
}
