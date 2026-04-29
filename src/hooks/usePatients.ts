import { useCallback, useEffect, useState } from 'react'

import type { FhirPatient } from '@/models/patient'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { withPractitionerHeaders } from '@/lib/practitioners'
import { getErrorMessage } from '@/lib/errors'

async function fetchPatients(practitionerId: string): Promise<FhirPatient[]> {
  const res = await fetch('/api/patients', {
    cache: 'no-store',
    headers: withPractitionerHeaders(practitionerId),
  })
  if (!res.ok) throw new Error('Failed to load patients')
  return res.json()
}

async function createPatient(payload: FhirPatient, practitionerId: string): Promise<FhirPatient> {
  const res = await fetch('/api/patients', {
    method: 'POST',
    headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
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
  practitionerId: string,
): Promise<FhirPatient> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'PATCH',
    headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update patient')
  }

  return res.json()
}

async function deletePatientRequest(patientId: string, practitionerId: string): Promise<void> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, {
    method: 'DELETE',
    headers: withPractitionerHeaders(practitionerId),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to delete patient')
  }
}

export function usePatients() {
  const { practitionerId } = usePractitioner()
  const [patients, setPatients] = useState<FhirPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchPatients(practitionerId)
      setPatients(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load patients'))
      return []
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

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
        const created = await createPatient(payload, practitionerId)
        prependPatient(created)
        return created
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to create patient'))
        return null
      }
    },
    [prependPatient, practitionerId],
  )

  const patchPatientById = useCallback(
    async (patientId: string, payload: Partial<FhirPatient>) => {
      try {
        setError(null)
        const updated = await patchPatient(patientId, payload, practitionerId)
        replacePatient(updated)
        return updated
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to update patient'))
        return null
      }
    },
    [replacePatient, practitionerId],
  )

  const deletePatientById = useCallback(
    async (patientId: string) => {
      try {
        setError(null)
        await deletePatientRequest(patientId, practitionerId)
        removePatient(patientId)
        return true
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to delete patient'))
        return false
      }
    },
    [removePatient, practitionerId],
  )

  return {
    practitionerId,
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
