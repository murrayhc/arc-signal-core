import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../helpers'
import { runSeed } from '@/server/seed'
import { GET as getMarketStatus } from '@/app/api/market/status/route'
import { GET as getMarketSearch } from '@/app/api/market/search/route'

function reqUrl(url: string) {
  return new Request(url)
}

describe('market status/search API (dormant — no MARKET_DATA_API_KEY)', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
  })

  it('GET /api/market/status (dormant) returns 200 { configured:false, provider:null, delayed:true }', async () => {
    const res = await getMarketStatus()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ configured: false, provider: null, delayed: true })
  })

  it('GET /api/market/search?q=copper (dormant) returns 200 { configured:false, results:[] }', async () => {
    const res = await getMarketSearch(reqUrl('http://test.local/api/market/search?q=copper'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ configured: false, results: [] })
  })

  it('GET /api/market/search with missing q returns 400', async () => {
    const res = await getMarketSearch(reqUrl('http://test.local/api/market/search'))
    expect(res.status).toBe(400)
  })

  it('neither dormant response contains any env-key value', async () => {
    const statusRes = await getMarketStatus()
    const statusText = JSON.stringify(await statusRes.json())
    const searchRes = await getMarketSearch(reqUrl('http://test.local/api/market/search?q=copper'))
    const searchText = JSON.stringify(await searchRes.json())

    // No literal env-var names, and no non-null "apiKey"/"key" field values —
    // the responses must be structurally free of any key material.
    expect(statusText).not.toMatch(/MARKET_DATA_API_KEY/)
    expect(statusText).not.toMatch(/"(api)?[Kk]ey":\s*"[^"]/)
    expect(searchText).not.toMatch(/MARKET_DATA_API_KEY/)
    expect(searchText).not.toMatch(/"(api)?[Kk]ey":\s*"[^"]/)
  })
})
