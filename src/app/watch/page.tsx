import Link from 'next/link'
import { listWatchMarkets } from '@/server/watch/service'
import { WatchMarketManager } from '@/components/WatchMarketManager'

export const dynamic = 'force-dynamic'

export default async function WatchPage() {
  const markets = await listWatchMarkets()

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Watch Markets</h1>
      <p className="mt-1 text-sm text-slate-400">
        A watch market defines a scope — sectors, regions, themes, query terms — to track ahead of
        a fully-formed opportunity. Resolving a market matches its saved scope against currently
        detected events and opportunities; an empty scope never fabricates a match.
      </p>

      <WatchMarketManager initialMarkets={markets} />
    </main>
  )
}
