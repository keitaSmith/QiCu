'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_PRACTITIONER_ID,
  DEMO_PRACTITIONERS,
  type Practitioner,
} from '@/lib/practitioners'
import { isProductionLikeEnvironment } from '@/lib/auth/authMode'

const STORAGE_KEY = 'qicu:current-practitioner-id'

type PractitionerContextValue = {
  practitionerId: string
  currentPractitioner: Practitioner
  practitioners: Practitioner[]
  setPractitionerId: (value: string) => void
  source: 'session' | 'demo'
  isAuthenticated: boolean
  isDemoMode: boolean
  authLoading: boolean
  authRequired: boolean
}

const PractitionerContext = createContext<PractitionerContextValue | null>(null)

export function PractitionerProvider({ children }: { children: ReactNode }) {
  const [practitionerId, setPractitionerIdState] = useState(DEFAULT_PRACTITIONER_ID)
  const [sessionPractitioner, setSessionPractitioner] = useState<Practitioner | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadAuthState() {
      let hasSessionPractitioner = false
      let requiresAuth = isProductionLikeEnvironment()
      try {
        const response = await fetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'include',
        })
        requiresAuth =
          response.headers.get('x-qicu-auth-enforcement') === 'strict' || isProductionLikeEnvironment()
        const data = await response.json().catch(() => null)
        const practitioner = data?.authenticated && data?.practitioner?.id
          ? {
              id: data.practitioner.id,
              name: data.practitioner.name ?? data.practitioner.id,
              email: data.user?.email ?? '',
              initials: (data.practitioner.name ?? data.practitioner.id)
                .split(/\s+/)
                .filter(Boolean)
                .map((part: string) => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase(),
            }
          : null

        if (cancelled) return
        setAuthRequired(requiresAuth)

        if (practitioner) {
          hasSessionPractitioner = true
          setSessionPractitioner(practitioner)
          setPractitionerIdState(practitioner.id)
          return
        }
      } finally {
        if (!cancelled) {
          if (!hasSessionPractitioner) {
            if (!requiresAuth) {
              const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
              if (saved && DEMO_PRACTITIONERS.some(practitioner => practitioner.id === saved)) {
                setPractitionerIdState(saved)
              }
            }
          }
          setAuthLoading(false)
        }
      }
    }

    loadAuthState().catch(() => {
      if (!cancelled) {
        setAuthRequired(isProductionLikeEnvironment())
        setAuthLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const setPractitionerId = useCallback((value: string) => {
    if (sessionPractitioner) return
    const next = DEMO_PRACTITIONERS.some(practitioner => practitioner.id === value)
      ? value
      : DEFAULT_PRACTITIONER_ID
    setPractitionerIdState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [sessionPractitioner])

  const currentPractitioner = useMemo(
    () => sessionPractitioner ?? DEMO_PRACTITIONERS.find(practitioner => practitioner.id === practitionerId) ?? DEMO_PRACTITIONERS[0],
    [practitionerId, sessionPractitioner],
  )

  const source: PractitionerContextValue['source'] = sessionPractitioner ? 'session' : 'demo'

  const value = useMemo(
    () => ({
      practitionerId,
      currentPractitioner,
      practitioners: sessionPractitioner ? [sessionPractitioner] : DEMO_PRACTITIONERS,
      setPractitionerId,
      source,
      isAuthenticated: Boolean(sessionPractitioner),
      isDemoMode: !sessionPractitioner,
      authLoading,
      authRequired,
    }),
    [authLoading, authRequired, practitionerId, currentPractitioner, sessionPractitioner, setPractitionerId, source],
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
