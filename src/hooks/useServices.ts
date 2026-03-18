import { useCallback, useEffect, useState } from 'react'

import type { Service } from '@/models/service'

async function fetchServices(): Promise<Service[]> {
  const res = await fetch('/api/services', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load services')
  return res.json()
}

async function createService(payload: Omit<Service, 'id'>): Promise<Service> {
  const res = await fetch('/api/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to create service')
  }

  return res.json()
}

async function patchService(serviceId: string, payload: Partial<Service>): Promise<Service> {
  const res = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update service')
  }

  return res.json()
}

async function deleteServiceRequest(serviceId: string): Promise<void> {
  const res = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to delete service')
  }
}

export function useServices() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchServices()
      setServices(items)
      return items
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load services')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => null)
  }, [refresh])

  const replaceService = useCallback((updated: Service) => {
    setServices(prev => prev.map(service => (service.id === updated.id ? updated : service)))
  }, [])

  const prependService = useCallback((created: Service) => {
    setServices(prev => [created, ...prev])
  }, [])

  const removeService = useCallback((serviceId: string) => {
    setServices(prev => prev.filter(service => service.id !== serviceId))
  }, [])

  const createServiceRecord = useCallback(async (payload: Omit<Service, 'id'>) => {
    try {
      setError(null)
      const created = await createService(payload)
      prependService(created)
      return created
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create service')
      return null
    }
  }, [prependService])

  const patchServiceById = useCallback(async (serviceId: string, payload: Partial<Service>) => {
    try {
      setError(null)
      const updated = await patchService(serviceId, payload)
      replaceService(updated)
      return updated
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update service')
      return null
    }
  }, [replaceService])

  const deleteServiceById = useCallback(async (serviceId: string) => {
    try {
      setError(null)
      await deleteServiceRequest(serviceId)
      removeService(serviceId)
      return true
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete service')
      return false
    }
  }, [removeService])

  return {
    services,
    loading,
    error,
    refresh,
    createServiceRecord,
    patchServiceById,
    deleteServiceById,
  }
}
