import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'

describe('routeTask', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
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

  it('is deterministic and prefers enabled configs when multiple support a task', () => {
    const configs = [
      { modelName: 'z-model', taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION']), enabled: false, costTier: 'LOW', latencyTier: 'FAST' },
      { modelName: 'a-model', taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION']), enabled: true, costTier: 'LOW', latencyTier: 'FAST' },
    ]
    const picked = routeTask('FAST_CLASSIFICATION', configs as unknown as Awaited<ReturnType<typeof loadRouterConfigs>>)
    expect(picked!.modelName).toBe('a-model')
  })

  it('loadRouterConfigs reads configs from the DB', async () => {
    const configs = await loadRouterConfigs()
    expect(configs.length).toBeGreaterThanOrEqual(1)
    const rowCount = await prisma.lLMProviderConfig.count()
    expect(configs.length).toBe(rowCount)
  })
})
