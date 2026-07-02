import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { createSignals, mapClaimToSignal } from '@/server/pipeline/signals'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSource } from '../factories'
import type { Claim } from '@prisma/client'

function fakeClaim(partial: Partial<Claim>): Claim {
  return { claimText: '', ...partial } as Claim
}

describe('mapClaimToSignal (pure)', () => {
  it('maps claim types to signal types with direction', () => {
    expect(mapClaimToSignal(fakeClaim({ claimType: 'LAYOFF_MENTION' }))).toEqual({
      signalType: 'LAYOFF_SIGNAL',
      direction: 'NEGATIVE',
      strength: 0.7,
    })
    expect(mapClaimToSignal(fakeClaim({ claimType: 'PROCUREMENT_EVENT' }))).toEqual({
      signalType: 'PROCUREMENT_INCREASE',
      direction: 'POSITIVE',
      strength: 0.7,
    })
    expect(
      mapClaimToSignal(fakeClaim({ claimType: 'HIRING_CHANGE', claimText: 'a hiring freeze was announced' })),
    ).toEqual({ signalType: 'HIRING_SLOWDOWN', direction: 'NEGATIVE', strength: 0.6 })
    expect(
      mapClaimToSignal(fakeClaim({ claimType: 'HIRING_CHANGE', claimText: 'a hiring surge was announced' })),
    ).toEqual({ signalType: 'HIRING_ACCELERATION', direction: 'POSITIVE', strength: 0.6 })
    expect(mapClaimToSignal(fakeClaim({ claimType: 'UNKNOWN' }))).toBeNull()
  })
})

describe('createSignals (persistence)', () => {
  beforeEach(resetDb)

  it('creates a signal linked back to claim, document and source — without any entity', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id, { sector: 'technology', region: 'UK' })
    const { signals, errors } = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(errors).toHaveLength(0)
    expect(signals).toHaveLength(1)
    expect(signals[0].claimId).toBe(claim.id)
    expect(signals[0].documentId).toBe(doc.id)
    expect(signals[0].sourceId).toBe(source.id)
    expect(signals[0].entityId).toBeNull()
    expect(signals[0].sector).toBe('technology')
    expect(signals[0].explanation).toContain('LAYOFF_MENTION')
  })

  it('does not create duplicate signals for the same claim', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    await createSignals([claim], new Map([[doc.id, doc]]))
    const second = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(second.signals).toHaveLength(0)
    expect(await prisma.signal.count()).toBe(1)
  })

  it('skips claims below the 0.4 confidence floor', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const weak = await makeClaim(doc.id, { extractionConfidence: 0.3 })
    const { signals } = await createSignals([weak], new Map([[doc.id, doc]]))
    expect(signals).toHaveLength(0)
  })
})
