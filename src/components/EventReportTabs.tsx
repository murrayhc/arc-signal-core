'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

export type ReportTab = { key: string; label: string; node: ReactNode }

/** Client tab shell for the event deep-report. Server-rendered section nodes are
 *  passed in as props; only the active one is shown. */
export function EventReportTabs({ tabs }: { tabs: ReportTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? '')
  const current = tabs.find((t) => t.key === active) ?? tabs[0]

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`shrink-0 rounded-t-md px-3 py-1.5 text-sm transition ${
              (current?.key ?? '') === t.key
                ? 'border-b-2 border-slate-300 font-semibold text-slate-100'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">{current?.node}</div>
    </div>
  )
}
