import Link from 'next/link'
import { listLenses } from '@/server/lens/service'
import { LensManager } from '@/components/LensManager'

export const dynamic = 'force-dynamic'

export default async function LensesPage() {
  const lenses = await listLenses()

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Revenue Lenses</h1>
      <p className="mt-1 text-sm text-slate-400">
        A lens shapes how opportunities are scored and positioned for a particular commercial
        angle — target sectors/regions, offer types, buyer personas, and an average deal size band
        that weights the commercial value score. Exactly one lens can be the default; the default
        lens must be reassigned before its predecessor can be deleted.
      </p>

      <LensManager initialLenses={lenses} />
    </main>
  )
}
