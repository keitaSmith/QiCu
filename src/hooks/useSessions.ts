import { useCallback, useEffect, useState } from 'react'

import type { Session } from '@/models/session'
import { SESSIONS_CHANGED_EVENT, emitSessionsChanged } from '@/lib/session-events'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { withPractitionerHeaders } from '@/lib/practitioners'

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

async function fetchSessions(practitionerId: string): Promise<Session[]> {
  const res = await fetch('/api/sessions', {
    cache: 'no-store',
    headers: withPractitionerHeaders(practitionerId),
  })
  if (!res.ok) throw new Error('Failed to load sessions')
  return res.json()
}

export function useSessions() {
  const { practitionerId } = usePractitioner()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchSessions(practitionerId)
      setSessions(items)
      return items
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions')
      return []
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

  useEffect(() => {
    refresh().catch(() => null)
  }, [refresh])

  useEffect(() => {
    const onChanged = () => {
      refresh().catch(() => null)
    }
    window.addEventListener(SESSIONS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(SESSIONS_CHANGED_EVENT, onChanged)
  }, [refresh])

  const updateSessionRecord = useCallback(
    async (sessionId: string, input: SessionMutationInput) => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      })

      const data = await parseJsonSafely(res)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update session')
      }

      emitSessionsChanged()
      return data as Session
    },
    [practitionerId],
  )

  const deleteSessionRecord = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      headers: withPractitionerHeaders(practitionerId),
    })

    const data = await parseJsonSafely(res)
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to delete session')
    }

    emitSessionsChanged()
  }, [practitionerId])

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
