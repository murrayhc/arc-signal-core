import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'

describe('routeTask', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    // routeTask only routes to ENABLED configs (disabling is the owner's cost
    // control) — these routing-table tests describe the activated state.
    await prisma.lLMProviderConfig.updateMany({ data: { enabled: true } })
  })

  it('returns the creative model for OPPORTUNITY_PLAYBOOK_GENERATION', async () => {
    const configs = await loadRouterConfigs()
    const picked = routeTask('OPPORTUNITY_PLAYBOOK_GENERATION', configs)
    expect(picked).not.toBeNull()
    expect(picked!.modelName).toBe('claude-sonnet-5')
  })

  it('returns the fast model for FAST_CLASSIFICATION', async () => {
    const configs = await loadRouterConfigs()
    const picked = routeTask('FAST_CLASSIFICATION', configs)
    expect(picked).not.toBeNull()
    expect(picked!.modelName).toBe('claude-haiku-4-5')
  })

  it('returns the reasoning model for CONTRADICTION_ANALYSIS', async () => {
    const configs = await loadRouterConfigs()
    const picked = routeTask('CONTRADICTION_ANALYSIS', configs)
    expect(picked).not.toBeNull()
    expect(picked!.modelName).toBe('claude-opus-4-8')
  })

  it('returns null for a task no seeded config supports', async () => {
    const configs = await loadRouterConfigs()
    const picked = routeTask('TRANSLATION', configs)
    expect(picked).toBeNull()
  })

  it('never routes to a disabled config, even when it is the only one supporting the task', () => {
    const configs = [
      { modelName: 'z-model', taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION']), enabled: false, costTier: 'LOW', latencyTier: 'FAST' },
      { modelName: 'a-model', taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION']), enabled: true, costTier: 'LOW', latencyTier: 'FAST' },
    ]
    // Enabled config wins deterministically.
    const picked = routeTask('FAST_CLASSIFICATION', configs as unknown as Awaited<ReturnType<typeof loadRouterConfigs>>)
    expect(picked!.modelName).toBe('a-model')

    // Sole supporter disabled → honestly unrouted, never silently selected.
    // This closes the activation cost trap: enabling one cheap model must not
    // route other task classes to a model the owner deliberately left off.
    const disabledOnly = configs.filter((c) => !c.enabled)
    expect(routeTask('FAST_CLASSIFICATION', disabledOnly as unknown as Awaited<ReturnType<typeof loadRouterConfigs>>)).toBeNull()
  })

  it('dormant seed state (all configs disabled) routes nothing', async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    const configs = await loadRouterConfigs()
    expect(configs.every((c) => !c.enabled)).toBe(true)
    expect(routeTask('FAST_CLASSIFICATION', configs)).toBeNull()
    expect(routeTask('OPPORTUNITY_PLAYBOOK_GENERATION', configs)).toBeNull()
  })

  it('loadRouterConfigs reads configs from the DB', async () => {
    const configs = await loadRouterConfigs()
    expect(configs.length).toBeGreaterThanOrEqual(1)
    const rowCount = await prisma.lLMProviderConfig.count()
    expect(configs.length).toBe(rowCount)
  })
})
