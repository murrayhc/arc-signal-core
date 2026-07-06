import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { resetDb } from './helpers'

describe('scans never make live LLM calls', () => {
  beforeEach(resetDb)

  it('a full fixture scan produces zero non-dormant LLMRun rows', async () => {
    await runSeed({ includeLive: false })
    await runFullScan()
    const runs = await prisma.lLMRun.findMany()
    // Anything the scan logs must be the dormant marker — never a live provider
    // call. Enrichment is on-demand only; the scan injects no provider.
    expect(runs.every((r) => r.status === 'SKIPPED_NO_PROVIDER' || r.provider === 'none')).toBe(true)
    const succeeded = runs.filter((r) => r.status === 'SUCCEEDED')
    expect(succeeded).toHaveLength(0)
  })
})
