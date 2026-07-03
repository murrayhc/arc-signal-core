'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Selection = {
  selectedId: string | null
  select: (id: string) => void
  clear: () => void
}

const SelectionContext = createContext<Selection | null>(null)

/**
 * Shared node-selection state between the Intelligence Brain (centre) and the
 * detail panel (right column). A client boundary that still lets the page keep
 * its panels server-rendered: server content flows through as children.
 */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const select = useCallback((id: string) => setSelectedId(id), [])
  const clear = useCallback(() => setSelectedId(null), [])
  const value = useMemo(() => ({ selectedId, select, clear }), [selectedId, select, clear])
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelection(): Selection {
  const ctx = useContext(SelectionContext)
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider')
  return ctx
}
