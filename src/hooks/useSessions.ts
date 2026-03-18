import { useCallback, useEffect, useState } from 'react'

import type { Session } from '@/models/session'
import { SESSIONS_CHANGED_EVENT, emitSessionsChanged } from '@/lib/session-events'

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

async function fetchSessions(): Promise<Session[]> {
  const res = await fetch('/api/sessions', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load sessions')
  return res.json()
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchSessions()
      setSessions(items)
      return items
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })

      const data = await parseJsonSafely(res)
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update session')
      }

      emitSessionsChanged()
      return data as Session
    },
    [],
  )

  const deleteSessionRecord = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    })

    const data = await parseJsonSafely(res)
    if (!res.ok) {
      throw new Error(data?.error || 'Failed to delete session')
    }

    emitSessionsChanged()
  }, [])

  return {
    sessions,
    setSessions,
    loading,
    error,
    refresh,
    updateSessionRecord,
    deleteSessionRecord,
  }
}
