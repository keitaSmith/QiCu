'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Session } from '@/models/session'
import { SessionDetailPanel } from '@/components/sessions/SessionDetailPanel'
import { PATIENTS } from '@/data/patients'
import { displayName } from '@/models/patient'

export default function SessionDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sessions/${id}`)
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
  }, [id])

  if (loading) return <div className="p-4 text-sm">Loading…</div>
  if (error || !session) return <div className="p-4 text-sm">Session not found.</div>

  const patient = PATIENTS.find(p => p.id === session.patientId)
  const patientName = patient ? displayName(patient) : session.patientId

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={() => router.back()}
        className="text-sm text-brand-700 underline"
      >
        ← Back to sessions
      </button>

      <SessionDetailPanel session={session} patientName={patientName} />
    </div>
  )
}
