import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { updateSourceHealth } from '@/server/pipeline/health'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('updateSourceHealth', () => {
  beforeEach(resetDb)

  it('marks producing sources HEALTHY and keeps them healthy across dedupe rescans', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 5 }])
    let health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('HEALTHY')
    expect(health.healthScore).toBe(1)
    // rescan: everything deduped, zero new docs — still healthy
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 0 }])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('HEALTHY')
    expect(health.documentsStoredLastRun).toBe(0)
  })

  it('never marks a source HEALTHY before it has produced a document', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 0 }])
    const health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('DEGRADED')
    expect(health.healthScore).toBe(0.5)
  })

  it('degrades then fails sources on consecutive failures', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'FAILED', documentsStored: 0 }])
    let health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('DEGRADED')
    expect(health.failureCount).toBe(1)
    expect(health.healthScore).toBe(0.66)
    await updateSourceHealth([{ sourceId: source.id, outcome: 'FAILED', documentsStored: 0 }])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('FAILING')
    expect(health.failureCount).toBe(2)
    expect(health.healthScore).toBe(0.32)
  })

  it('persists the failure reason on the health row, truncated', async () => {
    const source = await makeSource()
    await updateSourceHealth([
      { sourceId: source.id, outcome: 'FAILED', documentsStored: 0, errorMessage: 'ECONNREFUSED 127.0.0.1:9' },
    ])
    let health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.notes).toBe('Last failure: ECONNREFUSED 127.0.0.1:9')

    // Long errors are truncated, never stored unbounded.
    await updateSourceHealth([
      { sourceId: source.id, outcome: 'FAILED', documentsStored: 0, errorMessage: 'x'.repeat(1000) },
    ])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.notes!.length).toBeLessThanOrEqual('Last failure: '.length + 300)

    // Recovery clears the failure note (HEALTHY path sets notes null).
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 3 }])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.notes).toBeNull()
  })

  it('marks unsupported sources UNSUPPORTED with zero score', async () => {
    const source = await makeSource({ name: 'Unsupported', accessMethod: 'UNSUPPORTED', url: null })
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SKIPPED_UNSUPPORTED', documentsStored: 0 }])
    const health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('UNSUPPORTED')
    expect(health.healthScore).toBe(0)
  })
})
