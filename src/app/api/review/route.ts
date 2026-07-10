import { listReviewItems, reviewQueueCounts } from '@/server/review/service'
import type { ReviewItemType, ReviewStatus } from '@/shared/enums'
import { REVIEW_ITEM_TYPES, REVIEW_STATUSES } from '@/shared/enums'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const itemType = searchParams.get('type') ?? undefined
  if (status && !REVIEW_STATUSES.includes(status as ReviewStatus)) {
    return Response.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }
  if (itemType && !REVIEW_ITEM_TYPES.includes(itemType as ReviewItemType)) {
    return Response.json({ error: `Invalid type: ${itemType}` }, { status: 400 })
  }
  const [items, counts] = await Promise.all([
    listReviewItems({ status: status as ReviewStatus | undefined, itemType: itemType as ReviewItemType | undefined }),
    reviewQueueCounts(),
  ])
  return Response.json({ items, counts })
}
