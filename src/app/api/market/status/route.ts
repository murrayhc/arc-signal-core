import { getMarketStatus } from '@/server/market/provider'

/** Reports market-data provider status WITHOUT ever leaking the API key or
 *  any secret. Mirrors /api/llm/status. Dormant (no MARKET_DATA_API_KEY) is
 *  the default: { configured:false, provider:null, delayed:true }. */
export async function GET() {
  const { status, provider, delayed } = getMarketStatus()
  return Response.json({ configured: status === 'CONFIGURED', provider, delayed })
}
