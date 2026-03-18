import { servicesStore } from '@/data/servicesStore'
import { notFound } from 'next/navigation'
import { ServiceDetailPanel } from '@/components/services/ServiceDetailPanel'

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const service = servicesStore.find(item => item.id === id)

  if (!service) notFound()

  return <ServiceDetailPanel service={service} />
}
