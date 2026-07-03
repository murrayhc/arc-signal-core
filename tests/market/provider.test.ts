import { describe, expect, it } from 'vitest'
import { getActiveMarketProvider, getMarketStatus, NullProvider } from '@/server/market/provider'
import { NoMarketProviderConfiguredError, MarketDataValidationError } from '@/server/market/types'
import { validateProviderData, QuoteSchema } from '@/server/market/validate'

describe('getActiveMarketProvider', () => {
  it('returns null with no env (dormant)', () => {
    expect(getActiveMarketProvider({})).toBeNull()
  })

  it('returns null when MARKET_DATA_PROVIDER names an unregistered provider', () => {
    expect(
      getActiveMarketProvider({ MARKET_DATA_PROVIDER: 'x', MARKET_DATA_API_KEY: 'k' }),
    ).toBeNull()
  })
})

describe('NullProvider', () => {
  it('getQuote rejects with NoMarketProviderConfiguredError', async () => {
    await expect(new NullProvider().getQuote('X')).rejects.toThrow(NoMarketProviderConfiguredError)
  })
})

describe('getMarketStatus', () => {
  it('reports NOT_CONFIGURED/null/delayed:true with no env', () => {
    expect(getMarketStatus({})).toEqual({ status: 'NOT_CONFIGURED', provider: null, delayed: true })
  })
})

describe('validateProviderData', () => {
  it('throws MarketDataValidationError on malformed data', () => {
    expect(() => validateProviderData(QuoteSchema, { bad: 1 })).toThrow(MarketDataValidationError)
  })
})
