'use client'

import { useParams } from 'next/navigation'
import { ServiceDetailPanel } from '@/components/services/ServiceDetailPanel'
import { useServices } from '@/hooks/useServices'

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { services, loading } = useServices()
  const service = services.find(item => item.id === id)

  if (loading) return <div className="p-4 text-sm">Loading…</div>
  if (!service) return <div className="p-4 text-sm">Service not found.</div>

  return <ServiceDetailPanel service={service} />
}
