import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Session } from '@/models/session'
import { SESSIONS_CHANGED_EVENT, emitSessionsChanged } from '@/lib/session-events'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { buildPractitionerScopedFetchInit, type ClientPractitionerScope } from '@/lib/auth/clientFetch'
import { getErrorMessage } from '@/lib/errors'

type SessionMutationInput = {
  startDateTime?: string
  serviceId?: string
  chiefComplaint?: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  techniques?: string[]
  bookingId?: string | null
}

async function parseJsonSafely(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function fetchSessions(scope: ClientPractitionerScope): Promise<Session[]> {
  const res = await fetch('/api/sessions', buildPractitionerScopedFetchInit(scope, {
    cache: 'no-store',
  }))
  if (!res.ok) throw new Error('Failed to load sessions')
  return res.json()
}

export function useSessions() {
  const { practitionerId, source, authLoading } = usePractitioner()
  const scope = useMemo(() => ({ practitionerId, source }), [practitionerId, source])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (authLoading) return []
      const items = await fetchSessions(scope)
      setSessions(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load sessions'))
      return []
    } finally {
      setLoading(false)
    }
  }, [authLoading, scope])

  useEffect(() => {
    if (!authLoading) refresh().catch(() => null)
  }, [authLoading, refresh])

  useEffect(() => {
    const onChanged = () => {
      refresh().catch(() => null)
    }
    window.addEventListener(SESSIONS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, onChanged)
  }, [refresh])

  const updateSessionRecord = useCallback(
    async (sessionId: string, input: SessionMutationInput) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, buildPractitionerScopedFetchInit(scope, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }))

      const data = await parseJsonSafely(res)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update session')
      }

      emitSessionsChanged()
      return data as Session
    },
    [scope],
  )

  const deleteSessionRecord = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, buildPractitionerScopedFetchInit(scope, {
      method: 'DELETE',
    }))

    const data = await parseJsonSafely(res)
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to delete session')
    }

    emitSessionsChanged()
  }, [scope])

  return {
    practitionerId,
    sessions,
    setSessions,
    loading,
    error,
    refresh,
    updateSessionRecord,
    deleteSessionRecord,
  }
}
