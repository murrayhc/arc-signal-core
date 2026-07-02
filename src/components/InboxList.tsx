'use client'

import { useState } from 'react'
import type { FeedCardData } from '@/server/services/dashboard'
import { EventCard } from './EventCard'

const FILTERS = ['ALL', 'RISK', 'OPPORTUNITY', 'MIXED', 'WATCH', 'NEW', 'RISING', 'NEEDS_REVIEW', 'CONFIRMED'] as const

export function InboxList({ items }: { items: FeedCardData[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const visible = items.filter(
    (item) => filter === 'ALL' || item.eventClass === filter || item.status === filter,
  )
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              filter === f
                ? 'border-slate-300 bg-slate-200 text-slate-900'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No events match this filter.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <EventCard key={item.eventId} card={item} />
          ))}
        </div>
      )}
    </div>
  )
}
