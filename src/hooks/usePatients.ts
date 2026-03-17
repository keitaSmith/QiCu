import { useCallback, useEffect, useState } from 'react'

import type { FhirPatient } from '@/models/patient'

async function fetchPatients(): Promise<FhirPatient[]> {
  const res = await fetch('/api/patients', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load patients')
  return res.json()
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

  return {
    patients,
    setPatients,
    loading,
    error,
    refresh,
  }
}
