'use client'

import { createContext, useContext, ReactNode } from 'react'

export type RightPanelContextValue = {
  setRightPanelContent: (content: ReactNode | null) => void
}

/**
 * Global context so dashboard pages (patients/sessions/bookings)
 * can push content into the right-hand column.
 */
export const RightPanelContext = createContext<RightPanelContextValue | null>(null)

export function useRightPanel() {
  const ctx = useContext(RightPanelContext)
  if (!ctx) {
    throw new Error('useRightPanel must be used within RightPanelContext.Provider')
  }
  return ctx
}
