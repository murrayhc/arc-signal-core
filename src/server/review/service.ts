import type { ReviewItem } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ReviewItemType, ReviewStatus } from '@/shared/enums'
import { REVIEW_STATUSES } from '@/shared/enums'

/**
 * The review queue — the human-in-the-loop surface. Everything the pipeline
 * withholds or flags (quarantined claims, low-confidence named impacts,
 * ambiguous entities, contradiction spikes, copy-burst alerts) lands here as
 * a ReviewItem instead of silently shipping or silently disappearing.
 *
 * Idempotent: each producer computes a stable dedupeKey, so re-scans refresh
 * an existing item rather than piling up duplicates — and a PENDING item that
 * a human already actioned is never resurrected by a later scan.
 */

export type ReviewDraft = {
  itemType: ReviewItemType
  subjectKind: 'claim' | 'companyImpact' | 'entity' | 'event' | 'prediction'
  subjectId: string
  dedupeKey: string
  title: string
  reason: string
  severity?: number
  eventCandidateId?: string | null
  evidenceIds?: string[]
  detail?: Record<string, unknown>
}

/** Upserts a review item. If a human has already actioned the item
 *  (status != PENDING), the outcome is preserved — only PENDING items are
 *  refreshed with the latest reason/severity. */
export async function upsertReviewItem(draft: ReviewDraft): Promise<ReviewItem> {
  const existing = await prisma.reviewItem.findUnique({ where: { dedupeKey: draft.dedupeKey } })
  const data = {
    itemType: draft.itemType,
    subjectKind: draft.subjectKind,
    subjectId: draft.subjectId,
    title: draft.title,
    reason: draft.reason,
    severity: draft.severity ?? 0.5,
    eventCandidateId: draft.eventCandidateId ?? null,
    evidenceIdsJson: JSON.stringify(draft.evidenceIds ?? []),
    detailJson: JSON.stringify(draft.detail ?? {}),
  }
  if (!existing) {
    return prisma.reviewItem.create({ data: { dedupeKey: draft.dedupeKey, ...data } })
  }
  if (existing.status !== 'PENDING') return existing // human already decided — don't reopen
  return prisma.reviewItem.update({ where: { id: existing.id }, data })
}

/** Records a human decision. NEEDS_MORE_EVIDENCE keeps the item live but
 *  moves it out of the default pending view. */
export async function decideReviewItem(
  id: string,
  status: ReviewStatus,
  reviewerNote?: string,
): Promise<ReviewItem | null> {
  if (!REVIEW_STATUSES.includes(status)) throw new Error(`Invalid review status: ${status}`)
  const existing = await prisma.reviewItem.findUnique({ where: { id } })
  if (!existing) return null
  return prisma.reviewItem.update({
    where: { id },
    data: { status, reviewerNote: reviewerNote ?? existing.reviewerNote, reviewedAt: new Date() },
  })
}

export async function listReviewItems(opts: { status?: ReviewStatus; itemType?: ReviewItemType } = {}) {
  return prisma.reviewItem.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.itemType ? { itemType: opts.itemType } : {}),
    },
    orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  })
}

export async function reviewQueueCounts(): Promise<Record<string, number>> {
  const rows = await prisma.reviewItem.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, NEEDS_MORE_EVIDENCE: 0 }
  for (const r of rows) counts[r.status] = r._count._all
  return counts
}
