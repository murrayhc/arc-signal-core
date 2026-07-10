import Link from 'next/link'
import { listReviewItems, reviewQueueCounts } from '@/server/review/service'
import { ReviewQueue } from '@/components/ReviewQueue'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const [rawItems, counts] = await Promise.all([listReviewItems({ status: 'PENDING' }), reviewQueueCounts()])
  const items = rawItems.map((i) => ({
    id: i.id,
    itemType: i.itemType,
    status: i.status,
    title: i.title,
    reason: i.reason,
    severity: i.severity,
    eventCandidateId: i.eventCandidateId,
    createdAt: i.createdAt.toISOString(),
  }))
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-xl font-bold">Review Queue</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Everything the radar withheld or flagged rather than shipping silently: claims quarantined for recycled or
        contradicted evidence, companies named on thin evidence, unclassified recurring mentions, contradiction spikes,
        and possible coordinated amplification. Approve to admit, reject to tombstone, or ask for more evidence.
      </p>
      <div className="mt-4 flex gap-4 text-xs text-slate-400">
        <span>
          <span className="font-semibold text-amber-300">{counts.PENDING}</span> pending
        </span>
        <span>
          <span className="font-semibold text-teal-300">{counts.APPROVED}</span> approved
        </span>
        <span>
          <span className="font-semibold text-slate-300">{counts.REJECTED}</span> rejected
        </span>
        <span>
          <span className="font-semibold text-slate-300">{counts.NEEDS_MORE_EVIDENCE}</span> needs more
        </span>
      </div>
      <ReviewQueue initialItems={items} />
    </main>
  )
}
