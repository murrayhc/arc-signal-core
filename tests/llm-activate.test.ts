import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { setConfigsEnabled } from '../scripts/llm-activate'
import { resetDb } from './helpers'

describe('llm-activate', () => {
  beforeEach(resetDb)

  it('enables then disables all provider configs', async () => {
    await runSeed({ includeLive: false })
    const on = await setConfigsEnabled(true)
    expect(on).toBe(3)
    expect((await prisma.lLMProviderConfig.findMany()).every((c) => c.enabled)).toBe(true)

    const off = await setConfigsEnabled(false)
    expect(off).toBe(3)
    expect((await prisma.lLMProviderConfig.findMany()).every((c) => !c.enabled)).toBe(true)
  })
})
