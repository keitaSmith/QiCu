'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Session } from '@/models/session'
import { SessionDetailPanel } from '@/components/sessions/SessionDetailPanel'
import { displayName } from '@/models/patient'
import { usePatients } from '@/hooks/usePatients'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { withPractitionerHeaders } from '@/lib/practitioners'

export default function SessionDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const { patients } = usePatients()
  const { practitionerId } = usePractitioner()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          headers: withPractitionerHeaders(practitionerId),
        })
        if (!res.ok) throw new Error('Not found')
        const data: Session = await res.json()
        setSession(data)
      } catch {
        setError('Could not load session.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, practitionerId])

  const patientName = useMemo(() => {
    const patient = patients.find(p => p.id === session?.patientId)
    return patient ? displayName(patient) : session?.patientId ?? ''
  }, [patients, session])

  if (loading) return <div className="p-4 text-sm">Loading…</div>
  if (error || !session) return <div className="p-4 text-sm">Session not found.</div>

  return (
    <div className="space-y-4 p-4">
      <button onClick={() => router.back()} className="text-sm text-brand-700 underline">
        ← Back to sessions
      </button>

      <SessionDetailPanel session={session} patientName={patientName} />
    </div>
  )
}
