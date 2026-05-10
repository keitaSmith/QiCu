import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Service } from '@/models/service'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { buildPractitionerScopedFetchInit, type ClientPractitionerScope } from '@/lib/auth/clientFetch'
import { getErrorMessage } from '@/lib/errors'

async function fetchServices(scope: ClientPractitionerScope): Promise<Service[]> {
  const res = await fetch('/api/services', buildPractitionerScopedFetchInit(scope, {
    cache: 'no-store',
  }))
  if (!res.ok) throw new Error('Failed to load services')
  return res.json()
}

async function createService(
  payload: Omit<Service, 'id' | 'practitionerId'>,
  scope: ClientPractitionerScope,
): Promise<Service> {
  const res = await fetch('/api/services', buildPractitionerScopedFetchInit(scope, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to create service')
  }

  return res.json()
}

async function patchService(serviceId: string, payload: Partial<Service>, scope: ClientPractitionerScope): Promise<Service> {
  const res = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update service')
  }

  return res.json()
}

async function deleteServiceRequest(serviceId: string, scope: ClientPractitionerScope): Promise<void> {
  const res = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'DELETE',
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to delete service')
  }
}

export function useServices() {
  const { practitionerId, source, authLoading } = usePractitioner()
  const scope = useMemo(() => ({ practitionerId, source }), [practitionerId, source])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (authLoading) return []
      const items = await fetchServices(scope)
      setServices(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load services'))
      return []
    } finally {
      setLoading(false)
    }
  }, [authLoading, scope])

  useEffect(() => {
    if (!authLoading) refresh().catch(() => null)
  }, [authLoading, refresh])

  const replaceService = useCallback((updated: Service) => {
    setServices(prev => prev.map(service => (service.id === updated.id ? updated : service)))
  }, [])

  const prependService = useCallback((created: Service) => {
    setServices(prev => [created, ...prev])
  }, [])

  const removeService = useCallback((serviceId: string) => {
    setServices(prev => prev.filter(service => service.id !== serviceId))
  }, [])

  const createServiceRecord = useCallback(async (payload: Omit<Service, 'id' | 'practitionerId'>) => {
    try {
      setError(null)
      const created = await createService(payload, scope)
      prependService(created)
      return created
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create service'))
      return null
    }
  }, [prependService, scope])

  const patchServiceById = useCallback(async (serviceId: string, payload: Partial<Service>) => {
    try {
      setError(null)
      const updated = await patchService(serviceId, payload, scope)
      replaceService(updated)
      return updated
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update service'))
      return null
    }
  }, [replaceService, scope])

  const deleteServiceById = useCallback(async (serviceId: string) => {
    try {
      setError(null)
      await deleteServiceRequest(serviceId, scope)
      removeService(serviceId)
      return true
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete service'))
      return false
    }
  }, [removeService, scope])

  return {
    practitionerId,
    services,
    loading,
    error,
    refresh,
    createServiceRecord,
    patchServiceById,
    deleteServiceById,
  }
}
