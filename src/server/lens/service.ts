import { prisma } from '@/server/db'
import { POSITIONING_USER_TYPES, RISK_APPETITES } from '@/shared/enums'

function parseJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export type LensData = {
  id: string
  name: string
  description: string | null
  userType: string
  targetSectors: string[]
  targetRegions: string[]
  offerTypes: string[]
  buyerPersonas: string[]
  averageDealSize: string | null
  salesCycle: string | null
  excludedSectors: string[]
  riskAppetite: string
  active: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

type LensRow = {
  id: string
  name: string
  description: string | null
  userType: string
  targetSectorsJson: string
  targetRegionsJson: string
  offerTypesJson: string
  buyerPersonasJson: string
  averageDealSize: string | null
  salesCycle: string | null
  excludedSectorsJson: string
  riskAppetite: string
  active: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

function toLensData(row: LensRow): LensData {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    userType: row.userType,
    targetSectors: parseJsonArray(row.targetSectorsJson),
    targetRegions: parseJsonArray(row.targetRegionsJson),
    offerTypes: parseJsonArray(row.offerTypesJson),
    buyerPersonas: parseJsonArray(row.buyerPersonasJson),
    averageDealSize: row.averageDealSize,
    salesCycle: row.salesCycle,
    excludedSectors: parseJsonArray(row.excludedSectorsJson),
    riskAppetite: row.riskAppetite,
    active: row.active,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class InvalidLensFieldError extends Error {
  constructor(field: string, value: string) {
    super(`Invalid ${field}: ${value}`)
    this.name = 'InvalidLensFieldError'
  }
}

export class DefaultLensDeletionError extends Error {
  constructor(id: string) {
    super(`Cannot delete the default lens (${id}) without reassigning default to another lens first.`)
    this.name = 'DefaultLensDeletionError'
  }
}

function assertValidUserType(userType: string | undefined): void {
  if (userType !== undefined && !(POSITIONING_USER_TYPES as readonly string[]).includes(userType)) {
    throw new InvalidLensFieldError('userType', userType)
  }
}

function assertValidRiskAppetite(riskAppetite: string | undefined): void {
  if (riskAppetite !== undefined && !(RISK_APPETITES as readonly string[]).includes(riskAppetite)) {
    throw new InvalidLensFieldError('riskAppetite', riskAppetite)
  }
}

export type CreateLensInput = {
  name: string
  description?: string | null
  userType?: string
  targetSectors?: string[]
  targetRegions?: string[]
  offerTypes?: string[]
  buyerPersonas?: string[]
  averageDealSize?: string | null
  salesCycle?: string | null
  excludedSectors?: string[]
  riskAppetite?: string
  active?: boolean
  isDefault?: boolean
}

/**
 * Creating a lens with isDefault:true clears isDefault on every other lens first (single-default
 * invariant), inside the same transaction as the create so the DB never has two default lenses.
 */
export async function createLens(input: CreateLensInput): Promise<LensData> {
  assertValidUserType(input.userType)
  assertValidRiskAppetite(input.riskAppetite)

  const wantsDefault = input.isDefault ?? false

  const row = await prisma.$transaction(async (tx) => {
    if (wantsDefault) {
      await tx.revenueLens.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    }
    return tx.revenueLens.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        userType: input.userType ?? 'GENERAL',
        targetSectorsJson: JSON.stringify(input.targetSectors ?? []),
        targetRegionsJson: JSON.stringify(input.targetRegions ?? []),
        offerTypesJson: JSON.stringify(input.offerTypes ?? []),
        buyerPersonasJson: JSON.stringify(input.buyerPersonas ?? []),
        averageDealSize: input.averageDealSize ?? null,
        salesCycle: input.salesCycle ?? null,
        excludedSectorsJson: JSON.stringify(input.excludedSectors ?? []),
        riskAppetite: input.riskAppetite ?? 'MEDIUM',
        active: input.active ?? true,
        isDefault: wantsDefault,
      },
    })
  })
  return toLensData(row)
}

export async function listLenses(): Promise<LensData[]> {
  const rows = await prisma.revenueLens.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(toLensData)
}

export async function getLens(id: string): Promise<LensData | null> {
  const row = await prisma.revenueLens.findUnique({ where: { id } })
  return row ? toLensData(row) : null
}

export type UpdateLensInput = Partial<{
  name: string
  description: string | null
  userType: string
  targetSectors: string[]
  targetRegions: string[]
  offerTypes: string[]
  buyerPersonas: string[]
  averageDealSize: string | null
  salesCycle: string | null
  excludedSectors: string[]
  riskAppetite: string
  active: boolean
  isDefault: boolean
}>

/**
 * Setting isDefault:true on this lens clears isDefault on every other lens (single-default
 * invariant), inside the same transaction as the update.
 */
export async function updateLens(id: string, patch: UpdateLensInput): Promise<LensData | null> {
  assertValidUserType(patch.userType)
  assertValidRiskAppetite(patch.riskAppetite)

  const existing = await prisma.revenueLens.findUnique({ where: { id } })
  if (!existing) return null

  const row = await prisma.$transaction(async (tx) => {
    if (patch.isDefault === true) {
      await tx.revenueLens.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } })
    }
    return tx.revenueLens.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.userType !== undefined ? { userType: patch.userType } : {}),
        ...(patch.targetSectors !== undefined ? { targetSectorsJson: JSON.stringify(patch.targetSectors) } : {}),
        ...(patch.targetRegions !== undefined ? { targetRegionsJson: JSON.stringify(patch.targetRegions) } : {}),
        ...(patch.offerTypes !== undefined ? { offerTypesJson: JSON.stringify(patch.offerTypes) } : {}),
        ...(patch.buyerPersonas !== undefined ? { buyerPersonasJson: JSON.stringify(patch.buyerPersonas) } : {}),
        ...(patch.averageDealSize !== undefined ? { averageDealSize: patch.averageDealSize } : {}),
        ...(patch.salesCycle !== undefined ? { salesCycle: patch.salesCycle } : {}),
        ...(patch.excludedSectors !== undefined ? { excludedSectorsJson: JSON.stringify(patch.excludedSectors) } : {}),
        ...(patch.riskAppetite !== undefined ? { riskAppetite: patch.riskAppetite } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      },
    })
  })
  return toLensData(row)
}

/** Refuses to delete the isDefault lens — the caller must reassign default to another lens first. */
export async function deleteLens(id: string): Promise<boolean> {
  const existing = await prisma.revenueLens.findUnique({ where: { id } })
  if (!existing) return false
  if (existing.isDefault) throw new DefaultLensDeletionError(id)
  await prisma.revenueLens.delete({ where: { id } })
  return true
}

// --- averageDealSize weighting (the deferred 3a unblock) ---------------------------------------

/** GBP value below which a deal is treated as small. */
const SMALL_DEAL_CEILING = 10_000
/** GBP value below which a deal is treated as mid-market. */
const MID_DEAL_CEILING = 100_000
/** GBP value below which a deal is treated as large (>= this is treated as major/strategic). */
const LARGE_DEAL_CEILING = 1_000_000

const SMALL_DEAL_SIGNAL = 0.3
/** Also the DEFAULT signal for null/unparseable input — byte-compatible with the pre-3f-4 hardcoded 0.5. */
const MID_DEAL_SIGNAL = 0.5
const LARGE_DEAL_SIGNAL = 0.7
const MAJOR_DEAL_SIGNAL = 0.9

const SUFFIX_MULTIPLIERS: Record<string, number> = { k: 1_000, m: 1_000_000 }

/**
 * Parses a `RevenueLens.averageDealSize` string into a GBP number, or null if unparseable.
 * Strips `£`, `,` and spaces; reads the leading number with an optional `k`/`m` suffix; for a
 * range (e.g. "10k-50k") takes the LOW end. Never throws — any unparseable shape returns null,
 * which `lensValueSignal` treats as the neutral default band.
 */
export function parseDealSize(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null
  const cleaned = s.replace(/[£,\s]/g, '')
  if (cleaned.length === 0) return null

  // For a range, only the first (low) segment is parsed — everything after the first
  // separator is discarded.
  const [low] = cleaned.split('-')
  const match = /^(\d+(?:\.\d+)?)([km])?$/i.exec(low)
  if (!match) return null

  const base = Number.parseFloat(match[1])
  if (Number.isNaN(base)) return null

  const suffix = match[2]?.toLowerCase()
  const multiplier = suffix ? SUFFIX_MULTIPLIERS[suffix] : 1
  return base * multiplier
}

export type LensValueSignalInput = { averageDealSize: string | null } | null

/**
 * Deterministic [0,1] commercial-value-band signal from a lens's `averageDealSize`. A null lens
 * or a lens with no (or unparseable) `averageDealSize` yields 0.5 — the exact prior hardcoded
 * placeholder in `scoreOpportunity`, so the default-lens (or no-lens) scoring path stays
 * byte-compatible with every opportunity card scored before this weighting existed.
 *
 * Bands (GBP, low end of a range): <10,000 -> 0.3; 10,000..<100,000 -> 0.5; 100,000..<1,000,000
 * -> 0.7; >=1,000,000 -> 0.9.
 */
export function lensValueSignal(lens: LensValueSignalInput): number {
  if (!lens) return MID_DEAL_SIGNAL
  const value = parseDealSize(lens.averageDealSize)
  if (value === null) return MID_DEAL_SIGNAL
  if (value < SMALL_DEAL_CEILING) return SMALL_DEAL_SIGNAL
  if (value < MID_DEAL_CEILING) return MID_DEAL_SIGNAL
  if (value < LARGE_DEAL_CEILING) return LARGE_DEAL_SIGNAL
  return MAJOR_DEAL_SIGNAL
}
