import { servicesStore } from '@/data/servicesStore'
import { isTrashed } from '@/lib/dataLifecycle'
import type { Service } from '@/models/service'

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function listByPractitionerIncludingDisabled(practitionerId: string) {
  return servicesStore.filter(
    service => service.practitionerId === practitionerId && !isTrashed(service),
  )
}

export function listActiveByPractitioner(practitionerId: string) {
  return listByPractitionerIncludingDisabled(practitionerId).filter(
    service => service.active,
  )
}

export function getById(practitionerId: string, serviceId: string) {
  return (
    servicesStore.find(
      service =>
        service.id === serviceId &&
        service.practitionerId === practitionerId &&
        !isTrashed(service),
    ) ?? null
  )
}

export function findUsableById(practitionerId: string, serviceId: string) {
  const service = getById(practitionerId, serviceId)
  return service?.active ? service : null
}

export function findDuplicate(
  practitionerId: string,
  name: string,
  durationMinutes: number,
  options: { excludeServiceId?: string } = {},
) {
  return (
    servicesStore.find(
      service =>
        service.id !== options.excludeServiceId &&
        service.practitionerId === practitionerId &&
        !isTrashed(service) &&
        service.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        service.durationMinutes === durationMinutes,
    ) ?? null
  )
}

export function create(practitionerId: string, input: Partial<Service>) {
  const name = input.name?.trim()
  const durationMinutes = Number(input.durationMinutes)
  const description = input.description?.trim() || undefined
  const active = input.active ?? true

  if (!name) throw new Error('name is required')
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (findDuplicate(practitionerId, name, durationMinutes)) {
    throw new Error('duplicate service')
  }

  const created: Service = {
    id: `${slugify(practitionerId)}-${slugify(name)}-${durationMinutes}-${Math.random().toString(36).slice(2, 6)}`,
    practitionerId,
    name,
    durationMinutes,
    description,
    active,
  }

  servicesStore.unshift(created)
  return created
}

export function update(
  practitionerId: string,
  serviceId: string,
  input: Partial<Service>,
) {
  const index = servicesStore.findIndex(
    service =>
      service.id === serviceId &&
      service.practitionerId === practitionerId &&
      !isTrashed(service),
  )

  if (index === -1) return null

  const current = servicesStore[index]
  const nextName = typeof input.name === 'string' ? input.name.trim() : current.name
  const nextDurationMinutes =
    input.durationMinutes === undefined ? current.durationMinutes : Number(input.durationMinutes)

  if (!nextName) throw new Error('name is required')
  if (!Number.isFinite(nextDurationMinutes) || nextDurationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (findDuplicate(practitionerId, nextName, nextDurationMinutes, { excludeServiceId: serviceId })) {
    throw new Error('duplicate service')
  }

  const updated: Service = {
    ...current,
    ...input,
    practitionerId,
    name: nextName,
    durationMinutes: nextDurationMinutes,
    description:
      typeof input.description === 'string'
        ? input.description.trim() || undefined
        : current.description,
    active: input.active ?? current.active,
  }

  servicesStore[index] = updated
  return updated
}

export function disable(practitionerId: string, serviceId: string) {
  return update(practitionerId, serviceId, { active: false })
}

