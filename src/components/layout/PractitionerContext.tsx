'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_PRACTITIONER_ID,
  DEMO_PRACTITIONERS,
  type Practitioner,
} from '@/lib/practitioners'

const STORAGE_KEY = 'qicu:current-practitioner-id'

type PractitionerContextValue = {
  practitionerId: string
  currentPractitioner: Practitioner
  practitioners: Practitioner[]
  setPractitionerId: (value: string) => void
}

const PractitionerContext = createContext<PractitionerContextValue | null>(null)

export function PractitionerProvider({ children }: { children: ReactNode }) {
  const [practitionerId, setPractitionerIdState] = useState(DEFAULT_PRACTITIONER_ID)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    if (saved && DEMO_PRACTITIONERS.some(practitioner => practitioner.id === saved)) {
      setPractitionerIdState(saved)
    }
  }, [])

  const setPractitionerId = (value: string) => {
    const next = DEMO_PRACTITIONERS.some(practitioner => practitioner.id === value)
      ? value
      : DEFAULT_PRACTITIONER_ID
    setPractitionerIdState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  const currentPractitioner = useMemo(
    () => DEMO_PRACTITIONERS.find(practitioner => practitioner.id === practitionerId) ?? DEMO_PRACTITIONERS[0],
    [practitionerId],
  )

  const value = useMemo(
    () => ({
      practitionerId,
      currentPractitioner,
      practitioners: DEMO_PRACTITIONERS,
      setPractitionerId,
    }),
    [practitionerId, currentPractitioner],
  )

  return <PractitionerContext.Provider value={value}>{children}</PractitionerContext.Provider>
}

export function usePractitioner() {
  const context = useContext(PractitionerContext)
  if (!context) {
    throw new Error('usePractitioner must be used within a PractitionerProvider')
  }
  return context
}
