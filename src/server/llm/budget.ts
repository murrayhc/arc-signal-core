import { prisma } from '@/server/db'

export const DEFAULT_DAILY_CALL_CAP = 100

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

/** True while today's real call count is below the daily cap
 *  (`LLM_DAILY_CALL_CAP`, default 100). Over the cap, callers behave dormant. */
export async function isWithinDailyBudget(
  now: Date,
  cap = Number(process.env.LLM_DAILY_CALL_CAP ?? DEFAULT_DAILY_CALL_CAP),
): Promise<boolean> {
  return (await dailyCallCount(now)) < cap
}
