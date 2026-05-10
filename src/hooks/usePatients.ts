import { useCallback, useEffect, useMemo, useState } from 'react'

import type { FhirPatient } from '@/models/patient'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { buildPractitionerScopedFetchInit, type ClientPractitionerScope } from '@/lib/auth/clientFetch'
import { getErrorMessage } from '@/lib/errors'

async function fetchPatients(scope: ClientPractitionerScope): Promise<FhirPatient[]> {
  const res = await fetch('/api/patients', buildPractitionerScopedFetchInit(scope, {
    cache: 'no-store',
  }))
  if (!res.ok) throw new Error('Failed to load patients')
  return res.json()
}

async function createPatient(payload: FhirPatient, scope: ClientPractitionerScope): Promise<FhirPatient> {
  const res = await fetch('/api/patients', buildPractitionerScopedFetchInit(scope, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to create patient')
  }

  return res.json()
}

async function patchPatient(
  patientId: string,
  payload: Partial<FhirPatient>,
  scope: ClientPractitionerScope,
): Promise<FhirPatient> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update patient')
  }

  return res.json()
}

async function deletePatientRequest(patientId: string, scope: ClientPractitionerScope): Promise<void> {
  const res = await fetch(`/api/patients/${encodeURIComponent(patientId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'DELETE',
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to delete patient')
  }
}

export function usePatients() {
  const { practitionerId, source, authLoading } = usePractitioner()
  const scope = useMemo(() => ({ practitionerId, source }), [practitionerId, source])
  const [patients, setPatients] = useState<FhirPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (authLoading) return []
      const items = await fetchPatients(scope)
      setPatients(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load patients'))
      return []
    } finally {
      setLoading(false)
    }
  }, [authLoading, scope])

  useEffect(() => {
    if (!authLoading) refresh().catch(() => null)
  }, [authLoading, refresh])

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
        const created = await createPatient(payload, scope)
        prependPatient(created)
        return created
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to create patient'))
        return null
      }
    },
    [prependPatient, scope],
  )

  const patchPatientById = useCallback(
    async (patientId: string, payload: Partial<FhirPatient>) => {
      try {
        setError(null)
        const updated = await patchPatient(patientId, payload, scope)
        replacePatient(updated)
        return updated
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to update patient'))
        return null
      }
    },
    [replacePatient, scope],
  )

  const deletePatientById = useCallback(
    async (patientId: string) => {
      try {
        setError(null)
        await deletePatientRequest(patientId, scope)
        removePatient(patientId)
        return true
      } catch (e: unknown) {
        setError(getErrorMessage(e, 'Failed to delete patient'))
        return false
      }
    },
    [removePatient, scope],
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
