import { prisma } from '@/server/db'

export const DEFAULT_DAILY_CALL_CAP = 100

/** Default daily monetary ceiling, in USD (Anthropic bills in USD). Deliberately
 *  conservative — the owner can raise it via LLM_DAILY_SPEND_CAP_USD. */
export const DEFAULT_DAILY_SPEND_CAP_USD = 5

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Real LLM calls made today (UTC). SKIPPED_* rows made no call, so they don't
 *  count toward the budget. */
export async function dailyCallCount(now: Date): Promise<number> {
  return prisma.lLMRun.count({
    where: {
      status: { in: ['SUCCEEDED', 'FAILED', 'REJECTED_VALIDATION'] },
      createdAt: { gte: startOfUtcDay(now) },
    },
  })
}

/** Estimated USD spent on real LLM calls today (UTC), summed from the
 *  per-model estimatedCost recorded on each run. */
export async function dailySpendUsd(now: Date): Promise<number> {
  const agg = await prisma.lLMRun.aggregate({
    _sum: { estimatedCost: true },
    where: {
      status: { in: ['SUCCEEDED', 'FAILED', 'REJECTED_VALIDATION'] },
      createdAt: { gte: startOfUtcDay(now) },
    },
  })
  return agg._sum.estimatedCost ?? 0
}

/** True while today is under BOTH budget gates, checked before any provider
 *  call:
 *  - call-count cap (`LLM_DAILY_CALL_CAP`, default 100) — a blunt runaway-loop
 *    backstop that treats every call the same regardless of model;
 *  - monetary cap (`LLM_DAILY_SPEND_CAP_USD`, default $5/day) — a true spend
 *    ceiling computed from per-model input/output token pricing, so 100 Opus
 *    calls and 100 Haiku calls are no longer "the same" to the budget.
 *  Over either cap, callers behave dormant (SKIPPED_BUDGET, no network call). */
export async function isWithinDailyBudget(
  now: Date,
  caps?: { callCap?: number; spendCapUsd?: number },
): Promise<boolean> {
  const callCap = caps?.callCap ?? Number(process.env.LLM_DAILY_CALL_CAP ?? DEFAULT_DAILY_CALL_CAP)
  const spendCapUsd =
    caps?.spendCapUsd ?? Number(process.env.LLM_DAILY_SPEND_CAP_USD ?? DEFAULT_DAILY_SPEND_CAP_USD)
  if ((await dailyCallCount(now)) >= callCap) return false
  return (await dailySpendUsd(now)) < spendCapUsd
}
