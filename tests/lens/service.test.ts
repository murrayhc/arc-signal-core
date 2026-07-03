import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import {
  createLens,
  listLenses,
  getLens,
  updateLens,
  deleteLens,
  lensValueSignal,
  parseDealSize,
  DefaultLensDeletionError,
  InvalidLensFieldError,
} from '@/server/lens/service'

describe('lens CRUD (persistence)', () => {
  beforeEach(resetDb)

  it('round-trips create/list/get/update/delete', async () => {
    const created = await createLens({ name: 'Recruiter lens', userType: 'RECRUITER', riskAppetite: 'HIGH' })
    expect(created.name).toBe('Recruiter lens')
    expect(created.userType).toBe('RECRUITER')
    expect(created.riskAppetite).toBe('HIGH')
    expect(created.active).toBe(true)
    expect(created.isDefault).toBe(false)

    const listed = await listLenses()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(created.id)

    const fetched = await getLens(created.id)
    expect(fetched?.name).toBe('Recruiter lens')

    const updated = await updateLens(created.id, { description: 'Targets recruiters', averageDealSize: '£50k' })
    expect(updated?.description).toBe('Targets recruiters')
    expect(updated?.averageDealSize).toBe('£50k')

    const deleted = await deleteLens(created.id)
    expect(deleted).toBe(true)
    expect(await getLens(created.id)).toBeNull()
  })

  it('serializes *Json fields into arrays — never leaks raw *Json strings', async () => {
    const created = await createLens({
      name: 'Sector lens',
      targetSectors: ['technology', 'finance'],
      targetRegions: ['UK'],
      offerTypes: ['advisory'],
      buyerPersonas: ['CFO'],
      excludedSectors: ['defence'],
    })
    expect(created.targetSectors).toEqual(['technology', 'finance'])
    expect(created.targetRegions).toEqual(['UK'])
    expect(created.offerTypes).toEqual(['advisory'])
    expect(created.buyerPersonas).toEqual(['CFO'])
    expect(created.excludedSectors).toEqual(['defence'])
    expect((created as unknown as Record<string, unknown>).targetSectorsJson).toBeUndefined()
    expect((created as unknown as Record<string, unknown>).excludedSectorsJson).toBeUndefined()
  })

  it('rejects an invalid userType', async () => {
    await expect(createLens({ name: 'Bad lens', userType: 'NOT_A_TYPE' })).rejects.toThrow(InvalidLensFieldError)
  })

  it('rejects an invalid riskAppetite', async () => {
    await expect(createLens({ name: 'Bad lens', riskAppetite: 'EXTREME' })).rejects.toThrow(InvalidLensFieldError)
  })

  it('rejects an invalid userType on update', async () => {
    const created = await createLens({ name: 'Lens X' })
    await expect(updateLens(created.id, { userType: 'NOT_A_TYPE' })).rejects.toThrow(InvalidLensFieldError)
  })

  it('never deletes the isDefault lens without reassigning default first', async () => {
    const defaultLens = await createLens({ name: 'Default lens', isDefault: true })
    await expect(deleteLens(defaultLens.id)).rejects.toThrow(DefaultLensDeletionError)
    // still present
    expect(await getLens(defaultLens.id)).not.toBeNull()
  })

  it('allows deleting the default lens once another lens has been made default', async () => {
    const defaultLens = await createLens({ name: 'Default lens', isDefault: true })
    const other = await createLens({ name: 'Other lens' })
    await updateLens(other.id, { isDefault: true })

    // reassigning default should have cleared isDefault on the prior default
    const priorDefault = await getLens(defaultLens.id)
    expect(priorDefault?.isDefault).toBe(false)

    const deleted = await deleteLens(defaultLens.id)
    expect(deleted).toBe(true)
  })

  it('setting isDefault on a lens clears isDefault on any other lens (single default invariant)', async () => {
    const a = await createLens({ name: 'Lens A', isDefault: true })
    const b = await createLens({ name: 'Lens B' })
    await updateLens(b.id, { isDefault: true })

    const refreshedA = await getLens(a.id)
    const refreshedB = await getLens(b.id)
    expect(refreshedA?.isDefault).toBe(false)
    expect(refreshedB?.isDefault).toBe(true)
  })

  it('deleteLens returns false for an unknown id', async () => {
    expect(await deleteLens('nope')).toBe(false)
  })

  it('updateLens returns null for an unknown id', async () => {
    expect(await updateLens('nope', { description: 'x' })).toBeNull()
  })
})

describe('parseDealSize (pure)', () => {
  it('returns null for null/empty/unparseable input', () => {
    expect(parseDealSize(null)).toBeNull()
    expect(parseDealSize('')).toBeNull()
    expect(parseDealSize('   ')).toBeNull()
    expect(parseDealSize('not a number')).toBeNull()
  })

  it('strips £, commas and spaces', () => {
    expect(parseDealSize('£5,000')).toBe(5000)
    expect(parseDealSize('£ 5000')).toBe(5000)
    expect(parseDealSize('5,000')).toBe(5000)
  })

  it('reads k/m suffixes', () => {
    expect(parseDealSize('5k')).toBe(5000)
    expect(parseDealSize('£50k')).toBe(50000)
    expect(parseDealSize('2m')).toBe(2000000)
    expect(parseDealSize('£2m')).toBe(2000000)
  })

  it('takes the low end of a range', () => {
    expect(parseDealSize('10k-50k')).toBe(10000)
    expect(parseDealSize('£10k-£50k')).toBe(10000)
    expect(parseDealSize('100000-500000')).toBe(100000)
  })
})

describe('lensValueSignal (pure)', () => {
  it('yields 0.5 (DEFAULT, byte-compatible) for null lens or no averageDealSize', () => {
    expect(lensValueSignal(null)).toBe(0.5)
    expect(lensValueSignal({ averageDealSize: null } as Parameters<typeof lensValueSignal>[0])).toBe(0.5)
    expect(lensValueSignal({ averageDealSize: 'not parseable' } as Parameters<typeof lensValueSignal>[0])).toBe(0.5)
  })

  it('bands £5k (< 10,000) to 0.3', () => {
    expect(lensValueSignal({ averageDealSize: '£5k' } as Parameters<typeof lensValueSignal>[0])).toBe(0.3)
  })

  it('bands £50k (10,000..<100,000) to 0.5', () => {
    expect(lensValueSignal({ averageDealSize: '£50k' } as Parameters<typeof lensValueSignal>[0])).toBe(0.5)
  })

  it('bands £250k (100,000..<1,000,000) to 0.7', () => {
    expect(lensValueSignal({ averageDealSize: '£250k' } as Parameters<typeof lensValueSignal>[0])).toBe(0.7)
  })

  it('bands £2m (>= 1,000,000) to 0.9', () => {
    expect(lensValueSignal({ averageDealSize: '£2m' } as Parameters<typeof lensValueSignal>[0])).toBe(0.9)
  })

  it('bands a "10k-50k" range (low end 10,000) to 0.5', () => {
    expect(lensValueSignal({ averageDealSize: '10k-50k' } as Parameters<typeof lensValueSignal>[0])).toBe(0.5)
  })
})
