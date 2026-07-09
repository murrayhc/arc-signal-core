import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'
import { resetDb } from './helpers'

const REAL_IDS = ['claude-haiku-4-5', 'claude-opus-4-8', 'claude-sonnet-5']

describe('seed provider configs (real model IDs)', () => {
  beforeEach(resetDb)

  it('seeds exactly 3 configs, all disabled, all real model IDs', async () => {
    await runSeed({ includeLive: false })
    const rows = await prisma.lLMProviderConfig.findMany()
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
    expect(rows.map((r) => r.modelName).sort()).toEqual([...REAL_IDS].sort())
  })

  it('routes representative task types to the intended real model once activated', async () => {
    await runSeed({ includeLive: false })
    // routeTask only routes to ENABLED configs — the dormant seed routes
    // nothing; this asserts the routing table under the activated state.
    const dormant = await loadRouterConfigs()
    expect(routeTask('COMPANY_IMPACT_ANALYSIS', dormant)).toBeNull()

    await prisma.lLMProviderConfig.updateMany({ data: { enabled: true } })
    const c = await loadRouterConfigs()
    expect(routeTask('COMPANY_IMPACT_ANALYSIS', c)?.modelName).toBe('claude-opus-4-8')
    expect(routeTask('PRESENT_CONTEXT', c)?.modelName).toBe('claude-sonnet-5')
    expect(routeTask('CLAIM_NORMALISATION', c)?.modelName).toBe('claude-haiku-4-5')
    expect(routeTask('SAFETY_REVIEW', c)?.modelName).toBe('claude-haiku-4-5')
  })

  it('re-seeding preserves an enabled config (does not force-disable)', async () => {
    await runSeed({ includeLive: false })
    await prisma.lLMProviderConfig.update({ where: { modelName: 'claude-opus-4-8' }, data: { enabled: true } })
    await runSeed({ includeLive: false })
    const opus = await prisma.lLMProviderConfig.findUnique({ where: { modelName: 'claude-opus-4-8' } })
    expect(opus?.enabled).toBe(true)
  })
})
