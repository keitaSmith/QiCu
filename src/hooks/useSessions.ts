import { useCallback, useEffect, useState } from 'react'

import type { Session } from '@/models/session'
import { SESSIONS_CHANGED_EVENT } from '@/lib/session-events'

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

  return { sessions, setSessions, loading, error, refresh }
}
