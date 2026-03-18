import { INITIAL_SERVICES } from '@/data/services'
import type { Service } from '@/models/service'

export const servicesStore: Service[] = INITIAL_SERVICES.map(service => ({ ...service }))

export function findServiceById(id: string | null | undefined): Service | undefined {
  if (!id) return undefined
  return servicesStore.find(service => service.id === id)
}
