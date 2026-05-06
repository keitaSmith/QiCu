import { and, eq, isNull, or } from 'drizzle-orm'

import { servicesStore } from '@/data/servicesStore'
import { drizzleDb } from '@/db/client'
import { services } from '@/db/schema'
import { demoPractitionerIds, demoServiceIds } from '@/db/seeds/ids'
import { isTrashed } from '@/lib/dataLifecycle'
import { serviceBelongsToPractitioner } from '@/lib/practitioners'
import type { Service } from '@/models/service'

const publicPractitionerIdToDatabaseId = demoPractitionerIds
const publicServiceIdToDatabaseId = demoServiceIds
const databaseServiceIdToPublicId = Object.fromEntries(
  Object.entries(publicServiceIdToDatabaseId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

type ServiceRow = typeof services.$inferSelect

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function databasePractitionerId(practitionerId: string) {
  return publicPractitionerIdToDatabaseId[
    practitionerId as keyof typeof publicPractitionerIdToDatabaseId
  ]
}

function databaseServiceId(serviceId: string) {
  return publicServiceIdToDatabaseId[serviceId as keyof typeof publicServiceIdToDatabaseId] ?? serviceId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function serviceIdCondition(serviceId: string) {
  const dbServiceId = databaseServiceId(serviceId)
  if (dbServiceId !== serviceId || isUuid(serviceId)) {
    return or(eq(services.id, dbServiceId), eq(services.publicId, serviceId))
  }
  return eq(services.publicId, serviceId)
}

function publicServiceIdForRow(row: ServiceRow) {
  return row.publicId ?? databaseServiceIdToPublicId[row.id] ?? row.id
}

function toPublicService(row: ServiceRow): Service {
  return {
    id: publicServiceIdForRow(row),
    practitionerId:
      Object.entries(publicPractitionerIdToDatabaseId).find(([, id]) => id === row.practitionerId)?.[0] ??
      row.practitionerId,
    name: row.name,
    durationMinutes: row.durationMinutes,
    description: row.description ?? undefined,
    active: row.active,
  }
}

function rememberRuntimeService(service: Service) {
  const index = servicesStore.findIndex(
    item => item.id === service.id && item.practitionerId === service.practitionerId,
  )
  const next = { ...service }

  if (index === -1) {
    servicesStore.unshift(next)
  } else if (!isTrashed(servicesStore[index])) {
    servicesStore[index] = {
      ...servicesStore[index],
      ...next,
    }
  }

  return service
}

function rememberRuntimeServices(serviceList: Service[]) {
  for (const service of serviceList) rememberRuntimeService(service)
  return serviceList
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

function fallbackListByPractitionerIncludingDisabled(practitionerId: string) {
  return servicesStore.filter(
    service => service.practitionerId === practitionerId && !isTrashed(service),
  )
}

function fallbackListGoogleImportCandidates(practitionerId: string) {
  return servicesStore.filter(service => serviceBelongsToPractitioner(service, practitionerId))
}

function fallbackGetById(practitionerId: string, serviceId: string) {
  return (
    servicesStore.find(
      service =>
        service.id === serviceId &&
        service.practitionerId === practitionerId &&
        !isTrashed(service),
    ) ?? null
  )
}

function fallbackFindDuplicate(
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

function fallbackCreate(practitionerId: string, input: Partial<Service>) {
  const name = input.name?.trim()
  const durationMinutes = Number(input.durationMinutes)
  const description = input.description?.trim() || undefined
  const active = input.active ?? true

  if (!name) throw new Error('name is required')
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (fallbackFindDuplicate(practitionerId, name, durationMinutes)) {
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

function fallbackUpdate(
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
  if (fallbackFindDuplicate(practitionerId, nextName, nextDurationMinutes, { excludeServiceId: serviceId })) {
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

export async function listByPractitionerIncludingDisabled(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListByPractitionerIncludingDisabled(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(services)
        .where(and(eq(services.practitionerId, dbPractitionerId), isNull(services.deletedAt)))
      return rememberRuntimeServices(rows.map(toPublicService))
    },
    () => fallbackListByPractitionerIncludingDisabled(practitionerId),
  )
}

export async function listActiveByPractitioner(practitionerId: string) {
  return (await listByPractitionerIncludingDisabled(practitionerId)).filter(
    service => service.active,
  )
}

export async function listGoogleImportCandidates(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListGoogleImportCandidates(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(services)
        .where(eq(services.practitionerId, dbPractitionerId))
      return rows.map(toPublicService)
    },
    () => fallbackListGoogleImportCandidates(practitionerId),
  )
}

export async function getById(practitionerId: string, serviceId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackGetById(practitionerId, serviceId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(services)
        .where(
          and(
            serviceIdCondition(serviceId),
            eq(services.practitionerId, dbPractitionerId),
            isNull(services.deletedAt),
          ),
        )
        .limit(1)
      return rows[0] ? rememberRuntimeService(toPublicService(rows[0])) : null
    },
    () => fallbackGetById(practitionerId, serviceId),
  )
}

export async function findUsableById(practitionerId: string, serviceId: string) {
  const service = await getById(practitionerId, serviceId)
  return service?.active ? service : null
}

export async function findDuplicate(
  practitionerId: string,
  name: string,
  durationMinutes: number,
  options: { excludeServiceId?: string } = {},
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackFindDuplicate(practitionerId, name, durationMinutes, options)

  const normalizedName = name.trim().toLowerCase()

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(services)
        .where(and(eq(services.practitionerId, dbPractitionerId), isNull(services.deletedAt)))

      return (
        rows
          .map(toPublicService)
          .find(
            service =>
              service.id !== options.excludeServiceId &&
              service.name.trim().toLowerCase() === normalizedName &&
              service.durationMinutes === durationMinutes,
          ) ?? null
      )
    },
    () => fallbackFindDuplicate(practitionerId, name, durationMinutes, options),
  )
}

export async function create(practitionerId: string, input: Partial<Service>) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackCreate(practitionerId, input)

  const name = input.name?.trim()
  const durationMinutes = Number(input.durationMinutes)
  const description = input.description?.trim() || undefined
  const active = input.active ?? true

  if (!name) throw new Error('name is required')
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (await findDuplicate(practitionerId, name, durationMinutes)) {
    throw new Error('duplicate service')
  }

  const publicId = `${slugify(practitionerId)}-${slugify(name)}-${durationMinutes}-${Math.random().toString(36).slice(2, 6)}`

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .insert(services)
        .values({
          publicId,
          practitionerId: dbPractitionerId,
          name,
          durationMinutes,
          description,
          active,
        })
        .returning()
      return rememberRuntimeService(toPublicService(rows[0]))
    },
    () => fallbackCreate(practitionerId, input),
  )
}

export async function update(
  practitionerId: string,
  serviceId: string,
  input: Partial<Service>,
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackUpdate(practitionerId, serviceId, input)

  const current = await getById(practitionerId, serviceId)
  if (!current) return null

  const nextName = typeof input.name === 'string' ? input.name.trim() : current.name
  const nextDurationMinutes =
    input.durationMinutes === undefined ? current.durationMinutes : Number(input.durationMinutes)

  if (!nextName) throw new Error('name is required')
  if (!Number.isFinite(nextDurationMinutes) || nextDurationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (await findDuplicate(practitionerId, nextName, nextDurationMinutes, { excludeServiceId: serviceId })) {
    throw new Error('duplicate service')
  }

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .update(services)
        .set({
          name: nextName,
          durationMinutes: nextDurationMinutes,
          description:
            typeof input.description === 'string'
              ? input.description.trim() || null
              : current.description ?? null,
          active: input.active ?? current.active,
          updatedAt: new Date(),
        })
        .where(
          and(
            serviceIdCondition(serviceId),
            eq(services.practitionerId, dbPractitionerId),
            isNull(services.deletedAt),
          ),
        )
        .returning()

      return rows[0] ? rememberRuntimeService(toPublicService(rows[0])) : null
    },
    () => fallbackUpdate(practitionerId, serviceId, input),
  )
}

export async function disable(practitionerId: string, serviceId: string) {
  return update(practitionerId, serviceId, { active: false })
}
