import { useCallback, useEffect, useState } from 'react'

import type { FhirPatient } from '@/models/patient'

async function fetchPatients(): Promise<FhirPatient[]> {
  const res = await fetch('/api/patients', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load patients')
  return res.json()
}

async function createPatient(payload: FhirPatient): Promise<FhirPatient> {
  const res = await fetch('/api/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to create patient')
  }

  return res.json()
}

async function patchPatient(
  patientId: string,
  payload: Partial<FhirPatient>,
): Promise<FhirPatient> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update patient')
  }

  return res.json()
}

async function deletePatientRequest(patientId: string): Promise<void> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to delete patient')
  }
}

export function usePatients() {
  const [patients, setPatients] = useState<FhirPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchPatients()
      setPatients(items)
      return items
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load patients')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => null)
  }, [refresh])

  const replacePatient = useCallback((updated: FhirPatient) => {
    setPatients(prev => prev.map(p => (p.id === updated.id ? updated : p)))
  }, [])

  const prependPatient = useCallback((created: FhirPatient) => {
    setPatients(prev => [created, ...prev])
  }, [])

  const removePatient = useCallback((patientId: string) => {
    setPatients(prev => prev.filter(p => p.id !== patientId))
  }, [])

  const createPatientRecord = useCallback(
    async (payload: FhirPatient) => {
      try {
        setError(null)
        const created = await createPatient(payload)
        prependPatient(created)
        return created
      } catch (e: any) {
        setError(e?.message ?? 'Failed to create patient')
        return null
      }
    },
    [prependPatient],
  )

  const patchPatientById = useCallback(
    async (patientId: string, payload: Partial<FhirPatient>) => {
      try {
        setError(null)
        const updated = await patchPatient(patientId, payload)
        replacePatient(updated)
        return updated
      } catch (e: any) {
        setError(e?.message ?? 'Failed to update patient')
        return null
      }
    },
    [replacePatient],
  )

  const deletePatientById = useCallback(
    async (patientId: string) => {
      try {
        setError(null)
        await deletePatientRequest(patientId)
        removePatient(patientId)
        return true
      } catch (e: any) {
        setError(e?.message ?? 'Failed to delete patient')
        return false
      }
    },
    [removePatient],
  )

  return {
    patients,
    setPatients,
    loading,
    error,
    refresh,
    replacePatient,
    prependPatient,
    removePatient,
    createPatientRecord,
    patchPatientById,
    deletePatientById,
  }
}
