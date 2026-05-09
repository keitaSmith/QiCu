import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { listTrash } from '@/lib/dataLifecycle'
import {
  buildTrashRecoveryView,
  filterTrashView,
  sortTrashView,
  type TrashPayload,
  type TrashSortOption,
  type TrashTypeFilter,
} from '@/lib/trashView'
import { drizzleDb } from '@/db/client'
import {
  bookings,
  deletionGroups,
  patients,
  services,
  sessions,
} from '@/db/schema'
import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
  demoSessionIds,
} from '@/db/seeds/ids'
import { setPatientPractitionerId } from '@/lib/practitioners'
import type { Booking, BookingStatus } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { BasicVitals, Session, TcmFindings } from '@/models/session'

type TrashRepositoryFilters = {
  query?: string
  type?: TrashTypeFilter
  sort?: TrashSortOption
}

type PatientRow = typeof patients.$inferSelect
type ServiceRow = typeof services.$inferSelect
type BookingRow = typeof bookings.$inferSelect
type SessionRow = typeof sessions.$inferSelect

type TrashRows = {
  patients: PatientRow[]
  bookings: BookingRow[]
  sessions: SessionRow[]
  services: ServiceRow[]
}

type PublicIdMaps = {
  patients: Map<string, string>
  services: Map<string, string>
  bookings: Map<string, string>
}

const publicPractitionerIdToDatabaseId = demoPractitionerIds
const databasePractitionerIdToPublicId = reverse(publicPractitionerIdToDatabaseId)
const databasePatientIdToPublicId = reverse(demoPatientIds)
const databaseServiceIdToPublicId = reverse(demoServiceIds)
const databaseBookingIdToPublicId = reverse(demoBookingIds)
const databaseSessionIdToPublicId = reverse(demoSessionIds)

function reverse<T extends Record<string, string>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([publicId, databaseId]) => [databaseId, publicId])) as Record<
    string,
    string
  >
}

function databasePractitionerId(practitionerId: string) {
  return publicPractitionerIdToDatabaseId[
    practitionerId as keyof typeof publicPractitionerIdToDatabaseId
  ]
}

function publicPractitionerIdForDatabaseId(practitionerId: string) {
  return databasePractitionerIdToPublicId[practitionerId] ?? practitionerId
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT)
}

function shouldUseDatabase() {
  return !isTestRuntime()
}

function isoOrUndefined(value?: Date | null) {
  return value ? value.toISOString() : undefined
}

function trashMetadataFromRow(row: {
  deletedAt: Date | null
  restoreUntil: Date | null
  deletedByPractitionerId: string | null
  deletionGroupId: string | null
  deletionType: string | null
  deletionReason: string | null
}): TrashMetadata | undefined {
  if (!row.deletedAt || !row.restoreUntil || !row.deletionGroupId || !row.deletionType) {
    return undefined
  }

  return {
    deletedAt: row.deletedAt.toISOString(),
    restoreUntil: row.restoreUntil.toISOString(),
    deletedByPractitionerId: row.deletedByPractitionerId
      ? publicPractitionerIdForDatabaseId(row.deletedByPractitionerId)
      : '',
    deletionGroupId: row.deletionGroupId,
    deletionType: row.deletionType as TrashMetadata['deletionType'],
    deletionReason: row.deletionReason ?? undefined,
  }
}

function publicPatientIdForRow(row: PatientRow) {
  return row.publicId ?? databasePatientIdToPublicId[row.id] ?? row.id
}

function publicServiceIdForRow(row: ServiceRow) {
  return row.publicId ?? databaseServiceIdToPublicId[row.id] ?? row.id
}

function publicBookingIdForRow(row: BookingRow) {
  return row.publicId ?? databaseBookingIdToPublicId[row.id] ?? row.id
}

function publicSessionIdForRow(row: SessionRow) {
  return row.publicId ?? databaseSessionIdToPublicId[row.id] ?? row.id
}

function asFhirJson(value: unknown): Partial<FhirPatient> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<FhirPatient>)
    : {}
}

function toPublicPatient(row: PatientRow): FhirPatient | null {
  const trashMetadata = trashMetadataFromRow(row)
  if (!trashMetadata) return null

  const source = asFhirJson(row.fhirJson)
  const publicId = publicPatientIdForRow(row)
  const patient: FhirPatient = {
    ...source,
    resourceType: 'Patient',
    id: publicId,
    active: row.active,
    meta: source.meta ?? { lastUpdated: isoOrUndefined(row.updatedAt) },
    name: source.name && source.name.length > 0
      ? source.name
      : [
          {
            text: row.displayName || publicId,
            family: row.lastName ?? undefined,
            given: row.firstName ? [row.firstName] : undefined,
          },
        ],
    birthDate: source.birthDate ?? row.birthDate ?? undefined,
    gender: source.gender ?? undefined,
    telecom: source.telecom ?? [
      row.phone ? { system: 'phone' as const, value: row.phone } : null,
      row.email ? { system: 'email' as const, value: row.email } : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    trashMetadata,
  }

  return setPatientPractitionerId(patient, publicPractitionerIdForDatabaseId(row.practitionerId))
}

function toPublicService(row: ServiceRow): Service | null {
  const trashMetadata = trashMetadataFromRow(row)
  if (!trashMetadata) return null

  return {
    id: publicServiceIdForRow(row),
    practitionerId: publicPractitionerIdForDatabaseId(row.practitionerId),
    name: row.name,
    durationMinutes: row.durationMinutes,
    description: row.description ?? undefined,
    active: row.active,
    trashMetadata,
  }
}

function toPublicBooking(row: BookingRow, maps: PublicIdMaps): Booking | null {
  const trashMetadata = trashMetadataFromRow(row)
  if (!trashMetadata) return null

  return {
    id: publicBookingIdForRow(row),
    code: row.code,
    practitionerId: publicPractitionerIdForDatabaseId(row.practitionerId),
    patientId: maps.patients.get(row.patientId) ?? databasePatientIdToPublicId[row.patientId] ?? row.patientId,
    serviceId: row.serviceId
      ? maps.services.get(row.serviceId) ?? databaseServiceIdToPublicId[row.serviceId] ?? row.serviceId
      : '',
    serviceName: row.serviceName,
    serviceDurationMinutes: row.serviceDurationMinutes,
    resource: row.resource ?? undefined,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    status: row.status as BookingStatus,
    statusUpdatedAt: isoOrUndefined(row.statusUpdatedAt),
    notes: row.notes ?? undefined,
    externalSource: (row.externalSource as Booking['externalSource']) ?? null,
    externalCalendarId: row.externalCalendarId ?? null,
    externalEventId: row.externalEventId ?? null,
    externalSyncStatus: (row.externalSyncStatus as Booking['externalSyncStatus']) ?? null,
    externalLastSyncedAt: isoOrUndefined(row.externalLastSyncedAt),
    trashMetadata,
  }
}

function toPublicSession(row: SessionRow, maps: PublicIdMaps): Session | null {
  const trashMetadata = trashMetadataFromRow(row)
  if (!trashMetadata) return null

  return {
    id: publicSessionIdForRow(row),
    practitionerId: publicPractitionerIdForDatabaseId(row.practitionerId),
    patientId: maps.patients.get(row.patientId) ?? databasePatientIdToPublicId[row.patientId] ?? row.patientId,
    bookingId: row.bookingId
      ? maps.bookings.get(row.bookingId) ?? databaseBookingIdToPublicId[row.bookingId] ?? row.bookingId
      : null,
    serviceId: row.serviceId
      ? maps.services.get(row.serviceId) ?? databaseServiceIdToPublicId[row.serviceId] ?? row.serviceId
      : undefined,
    serviceName: row.serviceName ?? undefined,
    startDateTime: row.startAt.toISOString(),
    chiefComplaint: row.chiefComplaint,
    treatmentSummary: row.treatmentSummary ?? undefined,
    outcome: row.outcome ?? undefined,
    treatmentNotes: row.treatmentNotes ?? undefined,
    painScore: row.painScore ?? undefined,
    tcmDiagnosis: row.tcmDiagnosis ?? undefined,
    tcmFindings: row.tcmFindings as TcmFindings | undefined,
    pointsUsed: row.pointsUsed ?? undefined,
    techniques: row.techniques ?? undefined,
    basicVitals: row.basicVitals as BasicVitals | undefined,
    trashMetadata,
  }
}

async function loadPublicIdMaps(rows: TrashRows): Promise<PublicIdMaps> {
  const patientIds = [...new Set([
    ...rows.bookings.map(row => row.patientId),
    ...rows.sessions.map(row => row.patientId),
  ])]
  const serviceIds = [...new Set([
    ...rows.bookings.map(row => row.serviceId).filter((id): id is string => Boolean(id)),
    ...rows.sessions.map(row => row.serviceId).filter((id): id is string => Boolean(id)),
  ])]
  const bookingIds = [...new Set(rows.sessions.map(row => row.bookingId).filter((id): id is string => Boolean(id)))]
  const patientPublicIds = new Map<string, string>()
  const servicePublicIds = new Map<string, string>()
  const bookingPublicIds = new Map<string, string>()

  if (patientIds.length > 0) {
    const patientRows = await drizzleDb
      .select({ id: patients.id, publicId: patients.publicId })
      .from(patients)
      .where(inArray(patients.id, patientIds))
    for (const patient of patientRows) {
      if (patient.publicId) patientPublicIds.set(patient.id, patient.publicId)
    }
  }

  if (serviceIds.length > 0) {
    const serviceRows = await drizzleDb
      .select({ id: services.id, publicId: services.publicId })
      .from(services)
      .where(inArray(services.id, serviceIds))
    for (const service of serviceRows) {
      if (service.publicId) servicePublicIds.set(service.id, service.publicId)
    }
  }

  if (bookingIds.length > 0) {
    const bookingRows = await drizzleDb
      .select({ id: bookings.id, publicId: bookings.publicId })
      .from(bookings)
      .where(inArray(bookings.id, bookingIds))
    for (const booking of bookingRows) {
      if (booking.publicId) bookingPublicIds.set(booking.id, booking.publicId)
    }
  }

  return { patients: patientPublicIds, services: servicePublicIds, bookings: bookingPublicIds }
}

export async function rowsToTrashPayload(
  rows: TrashRows,
  maps?: PublicIdMaps,
): Promise<TrashPayload> {
  const publicIdMaps = maps ?? await loadPublicIdMaps(rows)

  return {
    patients: rows.patients.map(toPublicPatient).filter((item): item is FhirPatient => Boolean(item)),
    bookings: rows.bookings.map(row => toPublicBooking(row, publicIdMaps)).filter((item): item is Booking => Boolean(item)),
    sessions: rows.sessions.map(row => toPublicSession(row, publicIdMaps)).filter((item): item is Session => Boolean(item)),
    services: rows.services.map(toPublicService).filter((item): item is Service => Boolean(item)),
  }
}

function hasTrash(payload: TrashPayload) {
  return payload.patients.length > 0 ||
    payload.bookings.length > 0 ||
    payload.sessions.length > 0 ||
    payload.services.length > 0
}

function mergeTrashPayloads(primary: TrashPayload, fallback: TrashPayload): TrashPayload {
  const seen = {
    patients: new Set(primary.patients.map(item => item.id)),
    bookings: new Set(primary.bookings.map(item => item.id)),
    sessions: new Set(primary.sessions.map(item => item.id)),
    services: new Set(primary.services.map(item => item.id)),
  }

  return {
    patients: [
      ...primary.patients,
      ...fallback.patients.filter(item => !seen.patients.has(item.id)),
    ],
    bookings: [
      ...primary.bookings,
      ...fallback.bookings.filter(item => !seen.bookings.has(item.id)),
    ],
    sessions: [
      ...primary.sessions,
      ...fallback.sessions.filter(item => !seen.sessions.has(item.id)),
    ],
    services: [
      ...primary.services,
      ...fallback.services.filter(item => !seen.services.has(item.id)),
    ],
  }
}

async function queryDatabaseTrash(practitionerId: string): Promise<TrashPayload> {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return { patients: [], bookings: [], sessions: [], services: [] }

  const groupRows = await drizzleDb
    .select({ id: deletionGroups.id })
    .from(deletionGroups)
    .where(eq(deletionGroups.practitionerId, dbPractitionerId))
  const deletionGroupIds = groupRows.map(row => row.id)

  if (deletionGroupIds.length === 0) {
    return { patients: [], bookings: [], sessions: [], services: [] }
  }

  const [patientRows, bookingRows, sessionRows, serviceRows] = await Promise.all([
    drizzleDb
      .select()
      .from(patients)
      .where(and(
        eq(patients.practitionerId, dbPractitionerId),
        isNotNull(patients.deletedAt),
        isNotNull(patients.deletionGroupId),
        inArray(patients.deletionGroupId, deletionGroupIds),
      )),
    drizzleDb
      .select()
      .from(bookings)
      .where(and(
        eq(bookings.practitionerId, dbPractitionerId),
        isNotNull(bookings.deletedAt),
        isNotNull(bookings.deletionGroupId),
        inArray(bookings.deletionGroupId, deletionGroupIds),
      )),
    drizzleDb
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.practitionerId, dbPractitionerId),
        isNotNull(sessions.deletedAt),
        isNotNull(sessions.deletionGroupId),
        inArray(sessions.deletionGroupId, deletionGroupIds),
      )),
    drizzleDb
      .select()
      .from(services)
      .where(and(
        eq(services.practitionerId, dbPractitionerId),
        isNotNull(services.deletedAt),
        isNotNull(services.deletionGroupId),
        inArray(services.deletionGroupId, deletionGroupIds),
      )),
  ])

  return rowsToTrashPayload({
    patients: patientRows,
    bookings: bookingRows,
    sessions: sessionRows,
    services: serviceRows,
  })
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

export async function listRawTrash(practitionerId: string) {
  const fallback = () => listTrash(practitionerId)
  if (!shouldUseDatabase()) return fallback()

  return runWithFallback(
    async () => {
      const dbTrash = await queryDatabaseTrash(practitionerId)
      const runtimeTrash = fallback()
      if (!hasTrash(runtimeTrash)) return dbTrash
      return mergeTrashPayloads(dbTrash, runtimeTrash)
    },
    fallback,
  )
}

export async function buildGroupedTrashView(practitionerId: string) {
  return buildTrashRecoveryView(await listRawTrash(practitionerId))
}

export async function listRecoveryView(
  practitionerId: string,
  filters: TrashRepositoryFilters = {},
) {
  const grouped = await buildGroupedTrashView(practitionerId)
  const filtered = filterTrashView(grouped, {
    query: filters.query ?? '',
    type: filters.type ?? 'all',
  })
  return sortTrashView(filtered, filters.sort ?? 'deleted-desc')
}

export async function getDeletionGroup(practitionerId: string, deletionGroupId: string) {
  const records = await listRawTrash(practitionerId)
  return {
    patients: records.patients.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    bookings: records.bookings.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    sessions: records.sessions.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    services: records.services.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
  }
}
