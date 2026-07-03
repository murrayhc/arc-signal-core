import { z, type ZodSchema } from 'zod'
import { COMMODITY_CATEGORIES, INSTRUMENT_TYPES } from '@/shared/enums'
import { MarketDataValidationError } from './types'

/** Boundary schema for InstrumentSearchHit — external provider data is
 *  untrusted input. */
export const InstrumentHitSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  exchange: z.string().nullable(),
  instrumentType: z.enum(INSTRUMENT_TYPES),
  currency: z.string().min(1),
})

/** Boundary schema for MarketQuote. */
export const QuoteSchema = z.object({
  symbol: z.string().min(1),
  price: z.number(),
  currency: z.string().min(1),
  changePct: z.number().nullable(),
  asOf: z.string().min(1),
  delayed: z.boolean(),
})

/** Boundary schema for CommodityContextData. */
export const CommodityContextSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().nullable(),
  category: z.enum(COMMODITY_CATEGORIES),
  keySupplyRegions: z.array(z.string()),
  keyDemandSectors: z.array(z.string()),
  delayed: z.boolean(),
})

/** Validates raw provider data against a boundary schema. Fails closed:
 *  throws MarketDataValidationError on any parse failure so malformed
 *  provider data never reaches the graph/UI. */
export function validateProviderData<T>(schema: ZodSchema<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new MarketDataValidationError(`Provider data failed validation: ${result.error.issues.map((i) => i.message).join('; ')}`)
  }
  return result.data
}
