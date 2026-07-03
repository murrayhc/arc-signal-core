import Link from 'next/link'
import { listPortfolio } from '@/server/portfolio/service'
import { prisma } from '@/server/db'
import { PortfolioManager } from '@/components/PortfolioManager'

export const dynamic = 'force-dynamic'

export default async function PortfolioPage() {
  const items = await listPortfolio()

  // Portfolio items store only opportunityCardId — the title/type live on OpportunityCard.
  // Looked up here at the page level (read-only, additive) rather than in the Task 2 service,
  // which stays untouched.
  const cardIds = items.map((i) => i.opportunityCardId)
  const cards = await prisma.opportunityCard.findMany({
    where: { id: { in: cardIds } },
    select: { id: true, title: true, opportunityType: true },
  })
  const cardById = new Map(cards.map((c) => [c.id, c]))

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Opportunity Portfolio</h1>
      <p className="mt-1 text-sm text-slate-400">
        Opportunities saved for active tracking. Update status, owner, next action and deadline as
        each one progresses.
      </p>

      <PortfolioManager
        initialItems={items}
        cardTitles={Object.fromEntries(
          items.map((i) => [
            i.opportunityCardId,
            {
              title: cardById.get(i.opportunityCardId)?.title ?? '(opportunity no longer available)',
              opportunityType: cardById.get(i.opportunityCardId)?.opportunityType ?? null,
            },
          ]),
        )}
      />
    </main>
  )
}
