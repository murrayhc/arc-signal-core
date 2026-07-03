import Link from 'next/link'
import { interrogate } from '@/server/interrogate/service'
import { SearchBar } from '@/components/SearchBar'
import { InterrogationResults } from '@/components/InterrogationResults'

export const dynamic = 'force-dynamic'

export default async function InterrogatePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">
        ← Dashboard
      </Link>
      <div className="mt-3">
        <h1 className="text-xl font-bold">Interrogate the graph</h1>
        <p className="mt-1 text-sm text-slate-400">
          Ask about a company, sector, commodity, ticker or theme to see what the living graph
          knows about it.
        </p>
      </div>

      <div className="mt-4">
        <SearchBar initialQuery={query} />
      </div>

      {query.length === 0 ? (
        <section className="mt-10 rounded-lg border border-dashed border-slate-700 p-10 text-center">
          <h2 className="text-lg font-semibold">Nothing to show yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Type a query above — e.g. a company name, sector, commodity, ticker or theme — to
            interrogate the graph.
          </p>
        </section>
      ) : (
        <InterrogationResultsSection query={query} />
      )}
    </main>
  )
}

async function InterrogationResultsSection({ query }: { query: string }) {
  const result = await interrogate(query)
  return <InterrogationResults result={result} />
}
