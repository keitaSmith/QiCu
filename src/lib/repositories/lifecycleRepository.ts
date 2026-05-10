import {
  type PatientLifecycleImpact,
  archivePatient as archivePatientInMemory,
  buildPatientFullExport,
  getPatientLifecycleImpact as getPatientLifecycleImpactInMemory,
  getServiceLifecycleImpact as getServiceLifecycleImpactInMemory,
  moveBookingToTrash as moveBookingToTrashInMemory,
  movePatientGraphToTrash as movePatientGraphToTrashInMemory,
  moveServiceToTrash as moveServiceToTrashInMemory,
  moveSessionToTrash as moveSessionToTrashInMemory,
  purgeExpiredTrash as purgeExpiredTrashInMemory,
  reactivatePatient as reactivatePatientInMemory,
  restoreDeletionGroup as restoreDeletionGroupInMemory,
} from '@/lib/dataLifecycle'
import { BOOKINGS } from '@/data/bookings'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import { drizzleDb } from '@/db/client'
import {
  bookings,
  deletionGroups,
  patients,
  services as servicesTable,
  sessions,
} from '@/db/schema'
import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
  demoSessionIds,
} from '@/db/seeds/ids'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import { patientsStore } from '@/data/patientsStore'
import {
  getPatientPractitionerId,
  patientBelongsToPractitioner,
  setPatientPractitionerId,
} from '@/lib/practitioners'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import type { Booking, BookingStatus } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import type { Session, TcmFindings } from '@/models/session'
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'

const RESTORE_WINDOW_DAYS = 30

const databasePractitionerIdByPublicId = demoPractitionerIds
const databaseBookingIdByPublicId = demoBookingIds
const databasePatientIdByPublicId = demoPatientIds
const databaseServiceIdByPublicId = demoServiceIds
const databaseSessionIdByPublicId = demoSessionIds
const publicPatientIdByDatabaseId = Object.fromEntries(
  Object.entries(databasePatientIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>
const publicBookingIdByDatabaseId = Object.fromEntries(
  Object.entries(databaseBookingIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>
const publicSessionIdByDatabaseId = Object.fromEntries(
  Object.entries(databaseSessionIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>
const publicServiceIdByDatabaseId = Object.fromEntries(
  Object.entries(databaseServiceIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>
const publicPractitionerIdByDatabaseId = Object.fromEntries(
  Object.entries(databasePractitionerIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

type PatientRow = typeof patients.$inferSelect
type BookingRow = typeof bookings.$inferSelect
type SessionRow = typeof sessions.$inferSelect
type ServiceRow = typeof servicesTable.$inferSelect

type ExportPublicIdMaps = {
  servicePublicIds: Map<string, string>
  bookingPublicIds: Map<string, string>
}

function databasePractitionerId(practitionerId: string) {
  return databasePractitionerIdByPublicId[
    practitionerId as keyof typeof databasePractitionerIdByPublicId
  ]
}

function databasePatientId(patientId: string) {
  return databasePatientIdByPublicId[patientId as keyof typeof databasePatientIdByPublicId] ?? patientId
}

function databaseBookingId(bookingId: string) {
  return databaseBookingIdByPublicId[bookingId as keyof typeof databaseBookingIdByPublicId] ?? bookingId
}

function databaseSessionId(sessionId: string) {
  return databaseSessionIdByPublicId[sessionId as keyof typeof databaseSessionIdByPublicId] ?? sessionId
}

function databaseServiceId(serviceId: string) {
  return databaseServiceIdByPublicId[serviceId as keyof typeof databaseServiceIdByPublicId] ?? serviceId
}

function publicPatientIdForRow(row: PatientRow) {
  return row.publicId ?? publicPatientIdByDatabaseId[row.id] ?? row.id
}

function publicBookingIdForRow(row: BookingRow) {
  return row.publicId ?? publicBookingIdByDatabaseId[row.id] ?? row.id
}

function publicSessionIdForRow(row: SessionRow) {
  return row.publicId ?? publicSessionIdByDatabaseId[row.id] ?? row.id
}

function publicServiceIdForRow(row: ServiceRow) {
  return row.publicId ?? publicServiceIdByDatabaseId[row.id] ?? row.id
}

function publicPractitionerIdForDatabaseId(practitionerId: string) {
  return publicPractitionerIdByDatabaseId[practitionerId] ?? practitionerId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function patientIdCondition(patientId: string) {
  const dbPatientId = databasePatientId(patientId)
  if (dbPatientId !== patientId || isUuid(patientId)) {
    return or(eq(patients.id, dbPatientId), eq(patients.publicId, patientId))
  }
  return eq(patients.publicId, patientId)
}

function bookingIdCondition(bookingId: string) {
  const dbBookingId = databaseBookingId(bookingId)
  if (dbBookingId !== bookingId || isUuid(bookingId)) {
    return or(eq(bookings.id, dbBookingId), eq(bookings.publicId, bookingId))
  }
  return eq(bookings.publicId, bookingId)
}

function sessionIdCondition(sessionId: string) {
  const dbSessionId = databaseSessionId(sessionId)
  if (dbSessionId !== sessionId || isUuid(sessionId)) {
    return or(eq(sessions.id, dbSessionId), eq(sessions.publicId, sessionId))
  }
  return eq(sessions.publicId, sessionId)
}

function serviceIdCondition(serviceId: string) {
  const dbServiceId = databaseServiceId(serviceId)
  if (dbServiceId !== serviceId || isUuid(serviceId)) {
    return or(eq(servicesTable.id, dbServiceId), eq(servicesTable.publicId, serviceId))
  }
  return eq(servicesTable.publicId, serviceId)
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => Promise<T> | T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT)
}

function restoreUntilFrom(deletedAt: Date) {
  const restoreUntil = new Date(deletedAt)
  restoreUntil.setDate(restoreUntil.getDate() + RESTORE_WINDOW_DAYS)
  return restoreUntil
}

function buildImpact(bookingRows: BookingRow[], sessionRows: SessionRow[], now = new Date()): PatientLifecycleImpact {
  const nowMs = now.getTime()
  const futureBookings = bookingRows.filter(
    booking =>
      String(booking.status).toLowerCase() !== 'cancelled' &&
      booking.startAt.getTime() > nowMs,
  ).length
  const pastBookings = bookingRows.filter(booking => booking.startAt.getTime() <= nowMs).length

  return {
    pastBookings,
    futureBookings,
    sessions: sessionRows.length,
    bookings: bookingRows.length,
    totalLinkedRecords: bookingRows.length + sessionRows.length,
  }
}

function activeFutureBookingRows(bookingRows: BookingRow[], now = new Date()) {
  const nowMs = now.getTime()
  return bookingRows.filter(
    booking =>
      String(booking.status).toLowerCase() !== 'cancelled' &&
      booking.startAt.getTime() > nowMs,
  )
}

function trashMetadataFrom(
  practitionerId: string,
  deletionGroupId: string,
  deletedAt: Date,
  restoreUntil: Date,
  deletionType: TrashMetadata['deletionType'] = 'patient-data',
  deletionReason?: string | null,
): TrashMetadata {
  return {
    deletedAt: deletedAt.toISOString(),
    restoreUntil: restoreUntil.toISOString(),
    deletedByPractitionerId: practitionerId,
    deletionGroupId,
    deletionType,
    deletionReason: deletionReason ?? undefined,
  }
}

function runtimePatient(practitionerId: string, patientId: string) {
  return patientsStore.find(
    patient => patient.id === patientId && patientBelongsToPractitioner(patient, practitionerId),
  )
}

function setPatientActiveInRuntime(practitionerId: string, patientId: string, active: boolean) {
  const patient = runtimePatient(practitionerId, patientId)
  if (patient) patient.active = active
}

function cancelRuntimeBookings(bookingRows: BookingRow[], statusUpdatedAt: Date) {
  const bookingIds = new Set(bookingRows.map(booking => booking.publicId ?? booking.id))
  for (const booking of BOOKINGS) {
    if (bookingIds.has(booking.id)) {
      booking.status = 'cancelled'
      booking.statusUpdatedAt = statusUpdatedAt.toISOString()
    }
  }
}

function runtimeBooking(practitionerId: string, bookingId: string) {
  return BOOKINGS.find(booking => booking.id === bookingId && booking.practitionerId === practitionerId)
}

function runtimeSession(practitionerId: string, sessionId: string) {
  return sessionsStore.find(session => session.id === sessionId && session.practitionerId === practitionerId)
}

function runtimeService(practitionerId: string, serviceId: string) {
  return servicesStore.find(service => service.id === serviceId && service.practitionerId === practitionerId)
}

function applyTrashToRuntime(
  practitionerId: string,
  patientId: string,
  metadata: TrashMetadata,
  bookingRows: BookingRow[],
  sessionRows: SessionRow[],
) {
  const patient = runtimePatient(practitionerId, patientId)
  if (patient) patient.trashMetadata = metadata

  const bookingIds = new Set(bookingRows.map(booking => booking.publicId ?? booking.id))
  for (const booking of BOOKINGS) {
    if (booking.practitionerId === practitionerId && bookingIds.has(booking.id)) {
      booking.trashMetadata = metadata
    }
  }

  const sessionIds = new Set(sessionRows.map(session => session.publicId ?? session.id))
  for (const session of sessionsStore) {
    if (session.practitionerId === practitionerId && sessionIds.has(session.id)) {
      session.trashMetadata = metadata
    }
  }
}

function clearTrashFromRuntime(practitionerId: string, deletionGroupId: string) {
  for (const patient of patientsStore) {
    if (
      getPatientPractitionerId(patient) === practitionerId &&
      patient.trashMetadata?.deletionGroupId === deletionGroupId
    ) {
      delete patient.trashMetadata
    }
  }

  for (const booking of BOOKINGS) {
    if (booking.practitionerId === practitionerId && booking.trashMetadata?.deletionGroupId === deletionGroupId) {
      delete booking.trashMetadata
    }
  }

  for (const session of sessionsStore) {
    if (session.practitionerId === practitionerId && session.trashMetadata?.deletionGroupId === deletionGroupId) {
      delete session.trashMetadata
    }
  }

  for (const service of servicesStore) {
    if (service.practitionerId === practitionerId && service.trashMetadata?.deletionGroupId === deletionGroupId) {
      delete service.trashMetadata
    }
  }
}

function applyBookingTrashToRuntime(practitionerId: string, bookingRow: BookingRow, metadata: TrashMetadata) {
  const booking = runtimeBooking(practitionerId, publicBookingIdForRow(bookingRow))
  if (booking) booking.trashMetadata = metadata
}

function applySessionTrashToRuntime(practitionerId: string, sessionRow: SessionRow, metadata: TrashMetadata) {
  const session = runtimeSession(practitionerId, publicSessionIdForRow(sessionRow))
  if (session) session.trashMetadata = metadata
}

function applyServiceTrashToRuntime(practitionerId: string, serviceRow: ServiceRow, metadata: TrashMetadata) {
  const service = runtimeService(practitionerId, publicServiceIdForRow(serviceRow))
  if (service) service.trashMetadata = metadata
}

function unlinkRuntimeSessionsFromBooking(practitionerId: string, bookingRow: BookingRow) {
  const publicBookingId = publicBookingIdForRow(bookingRow)
  for (const session of sessionsStore) {
    if (session.practitionerId === practitionerId && session.bookingId === publicBookingId && !session.trashMetadata) {
      session.bookingId = null
    }
  }
}

function clearRuntimeBookingSessionLink(practitionerId: string, sessionRow: SessionRow) {
  const publicSessionId = publicSessionIdForRow(sessionRow)
  for (const booking of BOOKINGS) {
    if (booking.practitionerId === practitionerId && booking.sessionId === publicSessionId && !booking.trashMetadata) {
      booking.sessionId = undefined
    }
  }
}

function removeRuntimePatient(practitionerId: string, patientRow: PatientRow) {
  const publicId = publicPatientIdForRow(patientRow)
  for (let index = patientsStore.length - 1; index >= 0; index -= 1) {
    if (
      patientsStore[index].id === publicId &&
      getPatientPractitionerId(patientsStore[index]) === practitionerId
    ) {
      patientsStore.splice(index, 1)
    }
  }
}

function removeRuntimeBooking(practitionerId: string, bookingRow: BookingRow) {
  const publicId = publicBookingIdForRow(bookingRow)
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id === publicId && BOOKINGS[index].practitionerId === practitionerId) {
      BOOKINGS.splice(index, 1)
    }
  }
}

function removeRuntimeSession(practitionerId: string, sessionRow: SessionRow) {
  const publicId = publicSessionIdForRow(sessionRow)
  for (let index = sessionsStore.length - 1; index >= 0; index -= 1) {
    if (sessionsStore[index].id === publicId && sessionsStore[index].practitionerId === practitionerId) {
      sessionsStore.splice(index, 1)
    }
  }
}

function removeRuntimeService(practitionerId: string, serviceRow: ServiceRow) {
  const publicId = publicServiceIdForRow(serviceRow)
  for (let index = servicesStore.length - 1; index >= 0; index -= 1) {
    if (servicesStore[index].id === publicId && servicesStore[index].practitionerId === practitionerId) {
      servicesStore.splice(index, 1)
    }
  }
}

function allRowsExpired(rows: Array<{ restoreUntil: Date | null }>, now: Date) {
  return rows.every(row => row.restoreUntil && row.restoreUntil.getTime() < now.getTime())
}

function asFhirJson(value: unknown): Partial<FhirPatient> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<FhirPatient>)
    : {}
}

function validGender(value: string | null) {
  return value === 'male' ||
    value === 'female' ||
    value === 'other' ||
    value === 'prefer_not_to_say'
    ? value
    : undefined
}

function toExportPatient(row: PatientRow): FhirPatient {
  const publicId = publicPatientIdForRow(row)
  const source = asFhirJson(row.fhirJson)
  const displayName = row.displayName || publicId
  const patient: FhirPatient = {
    ...source,
    resourceType: 'Patient',
    id: publicId,
    active: row.active,
    meta: source.meta ?? {
      lastUpdated: row.updatedAt?.toISOString(),
    },
    name:
      source.name && source.name.length > 0
        ? source.name
        : [
            {
              text: displayName,
              family: row.lastName ?? undefined,
              given: row.firstName ? [row.firstName] : undefined,
            },
          ],
    birthDate: source.birthDate ?? row.birthDate ?? undefined,
    gender: source.gender ?? validGender(row.gender),
    telecom:
      source.telecom ??
      [
        row.phone ? { system: 'phone' as const, value: row.phone } : null,
        row.email ? { system: 'email' as const, value: row.email } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    communication:
      source.communication ??
      (row.preferredLanguage
        ? [{ language: { text: row.preferredLanguage }, preferred: true }]
        : undefined),
  }

  return FhirPatientSchema.parse(
    setPatientPractitionerId(patient, publicPractitionerIdForDatabaseId(row.practitionerId)),
  )
}

function isoOrUndefined(value?: Date | null) {
  return value ? value.toISOString() : undefined
}

function bookingTrashMetadataForExport(row: BookingRow, practitionerId: string): Booking['trashMetadata'] {
  if (!row.deletedAt || !row.restoreUntil) return undefined
  return {
    deletedAt: row.deletedAt.toISOString(),
    restoreUntil: row.restoreUntil.toISOString(),
    deletedByPractitionerId:
      (row.deletedByPractitionerId && publicPractitionerIdForDatabaseId(row.deletedByPractitionerId)) ??
      practitionerId,
    deletionGroupId: row.deletionGroupId ?? `db-booking-trash-${row.id}`,
    deletionType: (row.deletionType as TrashMetadata['deletionType'] | null) ?? 'booking',
    deletionReason: row.deletionReason ?? undefined,
  }
}

function sessionTrashMetadataForExport(row: SessionRow, practitionerId: string): Session['trashMetadata'] {
  if (!row.deletedAt || !row.restoreUntil) return undefined
  return {
    deletedAt: row.deletedAt.toISOString(),
    restoreUntil: row.restoreUntil.toISOString(),
    deletedByPractitionerId:
      (row.deletedByPractitionerId && publicPractitionerIdForDatabaseId(row.deletedByPractitionerId)) ??
      practitionerId,
    deletionGroupId: row.deletionGroupId ?? `db-session-trash-${row.id}`,
    deletionType: (row.deletionType as TrashMetadata['deletionType'] | null) ?? 'session',
    deletionReason: row.deletionReason ?? undefined,
  }
}

function toExportBooking(
  row: BookingRow,
  patientPublicId: string,
  maps: ExportPublicIdMaps,
): Booking {
  const practitionerId = publicPractitionerIdForDatabaseId(row.practitionerId)
  return {
    id: publicBookingIdForRow(row),
    code: row.code,
    practitionerId,
    patientId: patientPublicId,
    serviceId: row.serviceId
      ? maps.servicePublicIds.get(row.serviceId) ?? publicServiceIdByDatabaseId[row.serviceId] ?? ''
      : '',
    serviceName: row.serviceName,
    serviceDurationMinutes: row.serviceDurationMinutes,
    resource: row.resource ?? undefined,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    status: row.status as BookingStatus,
    notes: row.notes ?? undefined,
    externalSource: (row.externalSource as Booking['externalSource']) ?? null,
    externalCalendarId: row.externalCalendarId ?? null,
    externalEventId: row.externalEventId ?? null,
    externalSyncStatus: (row.externalSyncStatus as Booking['externalSyncStatus']) ?? null,
    externalLastSyncedAt: isoOrUndefined(row.externalLastSyncedAt),
    statusUpdatedAt: isoOrUndefined(row.statusUpdatedAt),
    trashMetadata: bookingTrashMetadataForExport(row, practitionerId),
  }
}

function toExportSession(
  row: SessionRow,
  patientPublicId: string,
  maps: ExportPublicIdMaps,
): Session {
  const practitionerId = publicPractitionerIdForDatabaseId(row.practitionerId)
  return {
    id: publicSessionIdForRow(row),
    practitionerId,
    patientId: patientPublicId,
    bookingId: row.bookingId
      ? maps.bookingPublicIds.get(row.bookingId) ?? publicBookingIdByDatabaseId[row.bookingId] ?? row.bookingId
      : null,
    serviceId: row.serviceId
      ? maps.servicePublicIds.get(row.serviceId) ?? publicServiceIdByDatabaseId[row.serviceId] ?? undefined
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
    basicVitals: row.basicVitals as Session['basicVitals'],
    trashMetadata: sessionTrashMetadataForExport(row, practitionerId),
  }
}

async function loadExportPublicIdMaps(bookingRows: BookingRow[], sessionRows: SessionRow[]) {
  const serviceIds = [
    ...new Set(
      [
        ...bookingRows.map(row => row.serviceId),
        ...sessionRows.map(row => row.serviceId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ]
  const bookingIds = [
    ...new Set(sessionRows.map(row => row.bookingId).filter((id): id is string => Boolean(id))),
  ]
  const servicePublicIds = new Map<string, string>()
  const bookingPublicIds = new Map<string, string>()

  if (serviceIds.length > 0) {
    const serviceRows = await drizzleDb
      .select({
        id: servicesTable.id,
        publicId: servicesTable.publicId,
      })
      .from(servicesTable)
      .where(inArray(servicesTable.id, serviceIds))
    for (const row of serviceRows) {
      if (row.publicId) servicePublicIds.set(row.id, row.publicId)
    }
  }

  if (bookingIds.length > 0) {
    const linkedBookings = await drizzleDb
      .select({
        id: bookings.id,
        publicId: bookings.publicId,
      })
      .from(bookings)
      .where(inArray(bookings.id, bookingIds))
    for (const row of linkedBookings) {
      if (row.publicId) bookingPublicIds.set(row.id, row.publicId)
    }
  }

  return { servicePublicIds, bookingPublicIds }
}

async function fallbackArchivePatient(
  practitionerId: string,
  patientId: string,
  options?: { cancelFutureBookings?: boolean },
) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
  await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
  const result = archivePatientInMemory(patientId, practitionerId, options)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  await syncBookingsToDatabase(
    practitionerId,
    BOOKINGS.filter(booking => booking.patientId === patientId && booking.practitionerId === practitionerId).map(
      booking => booking.id,
    ),
  )
  return result
}

async function fallbackReactivatePatient(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  const patient = reactivatePatientInMemory(patientId, practitionerId)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  return patient
}

async function fallbackMovePatientGraphToTrash(
  practitionerId: string,
  patientId: string,
  options: { now?: Date } = {},
) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
  await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
  const result = movePatientGraphToTrashInMemory(patientId, practitionerId, options.now)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  await syncBookingsToDatabase(
    practitionerId,
    BOOKINGS.filter(booking => booking.patientId === patientId && booking.practitionerId === practitionerId).map(
      booking => booking.id,
    ),
  )
  await syncSessionsToDatabase(
    practitionerId,
    sessionsStore
      .filter(session => session.patientId === patientId && session.practitionerId === practitionerId)
      .map(session => session.id),
  )
  return result
}

async function fallbackRestoreDeletionGroup(
  practitionerId: string,
  deletionGroupId: string,
  options: { now?: Date } = {},
) {
  const patientIds = patientsStore
    .filter(
      patient =>
        patient.trashMetadata?.deletionGroupId === deletionGroupId &&
        getPatientPractitionerId(patient) === practitionerId,
    )
    .map(patient => patient.id)
  const bookingIds = BOOKINGS
    .filter(
      booking =>
        booking.trashMetadata?.deletionGroupId === deletionGroupId &&
        booking.practitionerId === practitionerId,
    )
    .map(booking => booking.id)
  const sessionIds = sessionsStore
    .filter(
      session =>
        session.trashMetadata?.deletionGroupId === deletionGroupId &&
        session.practitionerId === practitionerId,
    )
    .map(session => session.id)
  const result = restoreDeletionGroupInMemory(deletionGroupId, practitionerId, options.now)
  for (const patientId of patientIds) {
    await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  }
  await syncBookingsToDatabase(practitionerId, bookingIds)
  await syncSessionsToDatabase(practitionerId, sessionIds)
  return result
}

async function mirrorPatientForLifecycle(practitionerId: string, patientId: string) {
  await patientsRepository.getById(practitionerId, patientId)
}

async function mirrorPatientBookingsForLifecycle(practitionerId: string, patientId: string) {
  await bookingsRepository.listByPatient(practitionerId, patientId)
}

async function syncBookingsToDatabase(practitionerId: string, bookingIds: string[]) {
  for (const bookingId of bookingIds) {
    await bookingsRepository.syncRuntimeBookingToDatabase(practitionerId, bookingId)
  }
}

async function mirrorPatientSessionsForLifecycle(practitionerId: string, patientId: string) {
  await sessionsRepository.listByPatient(practitionerId, patientId)
}

async function syncSessionsToDatabase(practitionerId: string, sessionIds: string[]) {
  for (const sessionId of sessionIds) {
    await sessionsRepository.syncRuntimeSessionToDatabase(practitionerId, sessionId)
  }
}

export async function getPatientLifecycleImpact(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
  await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
  return getPatientLifecycleImpactInMemory(patientId, practitionerId)
}

export async function archivePatient(
  practitionerId: string,
  patientId: string,
  options?: { cancelFutureBookings?: boolean },
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackArchivePatient(practitionerId, patientId, options)

  return runWithFallback(
    async () => {
      await mirrorPatientForLifecycle(practitionerId, patientId)
      await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
      await mirrorPatientSessionsForLifecycle(practitionerId, patientId)

      const now = new Date()
      const statusUpdatedAt = new Date()
      const result = await drizzleDb.transaction(async tx => {
        const patientRows = await tx
          .select()
          .from(patients)
          .where(
            and(
              patientIdCondition(patientId),
              eq(patients.practitionerId, dbPractitionerId),
              isNull(patients.deletedAt),
            ),
          )
          .limit(1)

        const patientRow = patientRows[0]
        if (!patientRow) throw new Error('Patient not found')

        const bookingRows = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.practitionerId, dbPractitionerId),
              eq(bookings.patientId, patientRow.id),
              isNull(bookings.deletedAt),
            ),
          )
        const sessionRows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.practitionerId, dbPractitionerId),
              eq(sessions.patientId, patientRow.id),
              isNull(sessions.deletedAt),
            ),
          )

        const impact = buildImpact(bookingRows, sessionRows, now)
        await tx
          .update(patients)
          .set({
            active: false,
            archivedAt: now,
            updatedAt: now,
          })
          .where(eq(patients.id, patientRow.id))

        const futureBookings = options?.cancelFutureBookings
          ? activeFutureBookingRows(bookingRows, now)
          : []
        if (futureBookings.length > 0) {
          await tx
            .update(bookings)
            .set({
              status: 'cancelled',
              statusUpdatedAt,
              updatedAt: statusUpdatedAt,
            })
            .where(inArray(bookings.id, futureBookings.map(booking => booking.id)))
        }

        return { impact, cancelledBookings: futureBookings }
      })

      setPatientActiveInRuntime(practitionerId, patientId, false)
      cancelRuntimeBookings(result.cancelledBookings, statusUpdatedAt)
      const patient = await patientsRepository.getById(practitionerId, patientId)
      if (!patient) throw new Error('Patient not found')
      return { patient, impact: result.impact }
    },
    () => fallbackArchivePatient(practitionerId, patientId, options),
  )
}

export async function reactivatePatient(practitionerId: string, patientId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackReactivatePatient(practitionerId, patientId)

  return runWithFallback(
    async () => {
      await mirrorPatientForLifecycle(practitionerId, patientId)
      const rows = await drizzleDb.transaction(async tx => {
        const patientRows = await tx
          .update(patients)
          .set({
            active: true,
            archivedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              patientIdCondition(patientId),
              eq(patients.practitionerId, dbPractitionerId),
              isNull(patients.deletedAt),
            ),
          )
          .returning()

        return patientRows
      })

      if (rows.length === 0) throw new Error('Patient not found')
      setPatientActiveInRuntime(practitionerId, patientId, true)
      const patient = await patientsRepository.getById(practitionerId, patientId)
      if (!patient) throw new Error('Patient not found')
      return patient
    },
    () => fallbackReactivatePatient(practitionerId, patientId),
  )
}

export async function movePatientGraphToTrash(
  practitionerId: string,
  patientId: string,
  options: { now?: Date } = {},
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackMovePatientGraphToTrash(practitionerId, patientId, options)

  return runWithFallback(
    async () => {
      await mirrorPatientForLifecycle(practitionerId, patientId)
      await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
      await mirrorPatientSessionsForLifecycle(practitionerId, patientId)

      const deletedAt = options.now ?? new Date()
      const restoreUntil = restoreUntilFrom(deletedAt)
      const result = await drizzleDb.transaction(async tx => {
        const patientRows = await tx
          .select()
          .from(patients)
          .where(
            and(
              patientIdCondition(patientId),
              eq(patients.practitionerId, dbPractitionerId),
              isNull(patients.deletedAt),
            ),
          )
          .limit(1)

        const patientRow = patientRows[0]
        if (!patientRow) throw new Error('Patient not found')

        const bookingRows = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.practitionerId, dbPractitionerId),
              eq(bookings.patientId, patientRow.id),
              isNull(bookings.deletedAt),
            ),
          )
        const sessionRows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.practitionerId, dbPractitionerId),
              eq(sessions.patientId, patientRow.id),
              isNull(sessions.deletedAt),
            ),
          )

        const groupRows = await tx
          .insert(deletionGroups)
          .values({
            practitionerId: dbPractitionerId,
            deletionType: 'patient-data',
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
          })
          .returning()

        const deletionGroupId = groupRows[0].id
        const trashUpdate = {
          deletedAt,
          restoreUntil,
          deletedByPractitionerId: dbPractitionerId,
          deletionGroupId,
          deletionType: 'patient-data',
          deletionReason: null,
          updatedAt: deletedAt,
        }

        await tx.update(patients).set(trashUpdate).where(eq(patients.id, patientRow.id))
        if (bookingRows.length > 0) {
          await tx
            .update(bookings)
            .set(trashUpdate)
            .where(inArray(bookings.id, bookingRows.map(booking => booking.id)))
        }
        if (sessionRows.length > 0) {
          await tx
            .update(sessions)
            .set(trashUpdate)
            .where(inArray(sessions.id, sessionRows.map(session => session.id)))
        }

        return { bookingRows, sessionRows, deletionGroupId }
      })

      const metadata = trashMetadataFrom(
        practitionerId,
        result.deletionGroupId,
        deletedAt,
        restoreUntil,
      )
      applyTrashToRuntime(practitionerId, patientId, metadata, result.bookingRows, result.sessionRows)
      return {
        patient: runtimePatient(practitionerId, patientId),
        restoreUntil: restoreUntil.toISOString() as string | undefined,
        deletionGroupId: result.deletionGroupId,
        impact: {
          bookings: result.bookingRows.length,
          sessions: result.sessionRows.length,
        },
      }
    },
    () => fallbackMovePatientGraphToTrash(practitionerId, patientId, options),
  )
}

export async function moveBookingToTrash(
  practitionerId: string,
  bookingId: string,
  options: { now?: Date } = {},
) {
  const fallback = async () => {
    await bookingsRepository.getById(practitionerId, bookingId)
    await sessionsRepository.findByBookingId(practitionerId, bookingId)
    const linkedSessionIds = sessionsStore
      .filter(session => session.bookingId === bookingId && session.practitionerId === practitionerId)
      .map(session => session.id)
    const result = moveBookingToTrashInMemory(bookingId, practitionerId, options.now)
    await bookingsRepository.syncRuntimeBookingToDatabase(practitionerId, bookingId)
    await syncSessionsToDatabase(practitionerId, linkedSessionIds)
    return result
  }

  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallback()

  return runWithFallback(
    async () => {
      await bookingsRepository.getById(practitionerId, bookingId)
      await sessionsRepository.findByBookingId(practitionerId, bookingId)

      const deletedAt = options.now ?? new Date()
      const restoreUntil = restoreUntilFrom(deletedAt)
      const result = await drizzleDb.transaction(async tx => {
        const bookingRows = await tx
          .select()
          .from(bookings)
          .where(
            and(
              bookingIdCondition(bookingId),
              eq(bookings.practitionerId, dbPractitionerId),
              isNull(bookings.deletedAt),
            ),
          )
          .limit(1)
        const bookingRow = bookingRows[0]
        if (!bookingRow) throw new Error('Booking not found')

        const linkedSessionRows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.practitionerId, dbPractitionerId),
              eq(sessions.bookingId, bookingRow.id),
              isNull(sessions.deletedAt),
            ),
          )
        const groupRows = await tx
          .insert(deletionGroups)
          .values({
            practitionerId: dbPractitionerId,
            deletionType: 'booking',
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
          })
          .returning()
        const deletionGroupId = groupRows[0].id

        await tx
          .update(bookings)
          .set({
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
            deletionGroupId,
            deletionType: 'booking',
            deletionReason: null,
            updatedAt: deletedAt,
          })
          .where(eq(bookings.id, bookingRow.id))

        if (linkedSessionRows.length > 0) {
          await tx
            .update(sessions)
            .set({
              bookingId: null,
              updatedAt: deletedAt,
            })
            .where(inArray(sessions.id, linkedSessionRows.map(session => session.id)))
        }

        return { bookingRow, deletionGroupId }
      })

      const metadata = trashMetadataFrom(
        practitionerId,
        result.deletionGroupId,
        deletedAt,
        restoreUntil,
        'booking',
      )
      applyBookingTrashToRuntime(practitionerId, result.bookingRow, metadata)
      unlinkRuntimeSessionsFromBooking(practitionerId, result.bookingRow)
      return {
        booking: runtimeBooking(practitionerId, publicBookingIdForRow(result.bookingRow)),
        restoreUntil: restoreUntil.toISOString() as string | undefined,
        deletionGroupId: result.deletionGroupId,
      }
    },
    fallback,
  )
}

export async function moveSessionToTrash(
  practitionerId: string,
  sessionId: string,
  options: { now?: Date } = {},
) {
  const fallback = async () => {
    await sessionsRepository.getById(practitionerId, sessionId)
    const result = moveSessionToTrashInMemory(sessionId, practitionerId, options.now)
    await sessionsRepository.syncRuntimeSessionToDatabase(practitionerId, sessionId)
    return result
  }

  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallback()

  return runWithFallback(
    async () => {
      await sessionsRepository.getById(practitionerId, sessionId)

      const deletedAt = options.now ?? new Date()
      const restoreUntil = restoreUntilFrom(deletedAt)
      const result = await drizzleDb.transaction(async tx => {
        const sessionRows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              sessionIdCondition(sessionId),
              eq(sessions.practitionerId, dbPractitionerId),
              isNull(sessions.deletedAt),
            ),
          )
          .limit(1)
        const sessionRow = sessionRows[0]
        if (!sessionRow) throw new Error('Session not found')

        const groupRows = await tx
          .insert(deletionGroups)
          .values({
            practitionerId: dbPractitionerId,
            deletionType: 'session',
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
          })
          .returning()
        const deletionGroupId = groupRows[0].id

        await tx
          .update(sessions)
          .set({
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
            deletionGroupId,
            deletionType: 'session',
            deletionReason: null,
            updatedAt: deletedAt,
          })
          .where(eq(sessions.id, sessionRow.id))

        return { sessionRow, deletionGroupId }
      })

      const metadata = trashMetadataFrom(
        practitionerId,
        result.deletionGroupId,
        deletedAt,
        restoreUntil,
        'session',
      )
      applySessionTrashToRuntime(practitionerId, result.sessionRow, metadata)
      clearRuntimeBookingSessionLink(practitionerId, result.sessionRow)
      return {
        session: runtimeSession(practitionerId, publicSessionIdForRow(result.sessionRow)),
        restoreUntil: restoreUntil.toISOString() as string | undefined,
        deletionGroupId: result.deletionGroupId,
      }
    },
    fallback,
  )
}

export function getServiceLifecycleImpact(practitionerId: string, serviceId: string) {
  return getServiceLifecycleImpactInMemory(serviceId, practitionerId)
}

export async function moveServiceToTrash(
  practitionerId: string,
  serviceId: string,
  options: { now?: Date } = {},
) {
  const fallback = () => moveServiceToTrashInMemory(serviceId, practitionerId, options.now)
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallback()

  return runWithFallback(
    async () => {
      await servicesRepository.getById(practitionerId, serviceId)

      const deletedAt = options.now ?? new Date()
      const restoreUntil = restoreUntilFrom(deletedAt)
      const result = await drizzleDb.transaction(async tx => {
        const serviceRows = await tx
          .select()
          .from(servicesTable)
          .where(
            and(
              serviceIdCondition(serviceId),
              eq(servicesTable.practitionerId, dbPractitionerId),
              isNull(servicesTable.deletedAt),
            ),
          )
          .limit(1)
        const serviceRow = serviceRows[0]
        if (!serviceRow) throw new Error('Service not found')

        const groupRows = await tx
          .insert(deletionGroups)
          .values({
            practitionerId: dbPractitionerId,
            deletionType: 'service',
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
          })
          .returning()
        const deletionGroupId = groupRows[0].id

        await tx
          .update(servicesTable)
          .set({
            deletedAt,
            restoreUntil,
            deletedByPractitionerId: dbPractitionerId,
            deletionGroupId,
            deletionType: 'service',
            deletionReason: null,
            updatedAt: deletedAt,
          })
          .where(eq(servicesTable.id, serviceRow.id))

        return { serviceRow, deletionGroupId }
      })

      const metadata = trashMetadataFrom(
        practitionerId,
        result.deletionGroupId,
        deletedAt,
        restoreUntil,
        'service',
      )
      applyServiceTrashToRuntime(practitionerId, result.serviceRow, metadata)
      return {
        service: runtimeService(practitionerId, publicServiceIdForRow(result.serviceRow)),
        restoreUntil: restoreUntil.toISOString() as string | undefined,
        deletionGroupId: result.deletionGroupId,
        impact: getServiceLifecycleImpactInMemory(serviceId, practitionerId),
      }
    },
    fallback,
  )
}

export async function disableService(practitionerId: string, serviceId: string) {
  return servicesRepository.disable(practitionerId, serviceId)
}

export async function restoreDeletionGroup(
  practitionerId: string,
  deletionGroupId: string,
  options: { now?: Date } = {},
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId || !isUuid(deletionGroupId)) {
    return fallbackRestoreDeletionGroup(practitionerId, deletionGroupId, options)
  }

  return runWithFallback(
    async () => {
      const now = options.now ?? new Date()
      const result = await drizzleDb.transaction(async tx => {
        const groupRows = await tx
          .select()
          .from(deletionGroups)
          .where(
            and(
              eq(deletionGroups.id, deletionGroupId),
              eq(deletionGroups.practitionerId, dbPractitionerId),
            ),
          )
          .limit(1)

        const group = groupRows[0]
        if (!group) throw new Error('Deletion group not found')

        const groupRestoreExpired = !group.restoreUntil || group.restoreUntil.getTime() < now.getTime()
        if (groupRestoreExpired) throw new Error('Restore window has expired')

        if (group.deletionType === 'booking') {
          const bookingRows = await tx
            .select()
            .from(bookings)
            .where(
              and(
                eq(bookings.practitionerId, dbPractitionerId),
                eq(bookings.deletionGroupId, deletionGroupId),
              ),
            )
          if (bookingRows.length === 0) throw new Error('Deletion group not found')
          const hasExpiredRecord = bookingRows.some(
            row => !row.restoreUntil || row.restoreUntil.getTime() < now.getTime(),
          )
          if (hasExpiredRecord) throw new Error('Restore window has expired')

          await tx
            .update(bookings)
            .set({
              deletedAt: null,
              restoreUntil: null,
              deletedByPractitionerId: null,
              deletionGroupId: null,
              deletionType: null,
              deletionReason: null,
              updatedAt: now,
            })
            .where(inArray(bookings.id, bookingRows.map(booking => booking.id)))

          return {
            restored: bookingRows.length,
            patientRows: [] as PatientRow[],
            bookingRows,
            sessionRows: [] as SessionRow[],
            serviceRows: [] as ServiceRow[],
          }
        }

        if (group.deletionType === 'session') {
          const sessionRows = await tx
            .select()
            .from(sessions)
            .where(
              and(
                eq(sessions.practitionerId, dbPractitionerId),
                eq(sessions.deletionGroupId, deletionGroupId),
              ),
            )
          if (sessionRows.length === 0) throw new Error('Deletion group not found')
          const hasExpiredRecord = sessionRows.some(
            row => !row.restoreUntil || row.restoreUntil.getTime() < now.getTime(),
          )
          if (hasExpiredRecord) throw new Error('Restore window has expired')

          await tx
            .update(sessions)
            .set({
              deletedAt: null,
              restoreUntil: null,
              deletedByPractitionerId: null,
              deletionGroupId: null,
              deletionType: null,
              deletionReason: null,
              updatedAt: now,
            })
            .where(inArray(sessions.id, sessionRows.map(session => session.id)))

          return {
            restored: sessionRows.length,
            patientRows: [] as PatientRow[],
            bookingRows: [] as BookingRow[],
            sessionRows,
            serviceRows: [] as ServiceRow[],
          }
        }

        if (group.deletionType === 'service') {
          const serviceRows = await tx
            .select()
            .from(servicesTable)
            .where(
              and(
                eq(servicesTable.practitionerId, dbPractitionerId),
                eq(servicesTable.deletionGroupId, deletionGroupId),
              ),
            )
          if (serviceRows.length === 0) throw new Error('Deletion group not found')
          const hasExpiredRecord = serviceRows.some(
            row => !row.restoreUntil || row.restoreUntil.getTime() < now.getTime(),
          )
          if (hasExpiredRecord) throw new Error('Restore window has expired')

          await tx
            .update(servicesTable)
            .set({
              deletedAt: null,
              restoreUntil: null,
              deletedByPractitionerId: null,
              deletionGroupId: null,
              deletionType: null,
              deletionReason: null,
              updatedAt: now,
            })
            .where(inArray(servicesTable.id, serviceRows.map(service => service.id)))

          return {
            restored: serviceRows.length,
            patientRows: [] as PatientRow[],
            bookingRows: [] as BookingRow[],
            sessionRows: [] as SessionRow[],
            serviceRows,
          }
        }

        if (group.deletionType !== 'patient-data') throw new Error('Deletion group not found')

        const patientRows = await tx
          .select()
          .from(patients)
          .where(
            and(
              eq(patients.practitionerId, dbPractitionerId),
              eq(patients.deletionGroupId, deletionGroupId),
            ),
          )
        const bookingRows = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.practitionerId, dbPractitionerId),
              eq(bookings.deletionGroupId, deletionGroupId),
            ),
          )
        const sessionRows = await tx
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.practitionerId, dbPractitionerId),
              eq(sessions.deletionGroupId, deletionGroupId),
            ),
          )

        const totalRecords = patientRows.length + bookingRows.length + sessionRows.length
        if (totalRecords === 0) throw new Error('Deletion group not found')

        const restoreWindows = [
          group.restoreUntil,
          ...patientRows.map(row => row.restoreUntil),
          ...bookingRows.map(row => row.restoreUntil),
          ...sessionRows.map(row => row.restoreUntil),
        ]
        const hasExpiredRecord = restoreWindows.some(restoreUntil => {
          return !restoreUntil || restoreUntil.getTime() < now.getTime()
        })
        if (hasExpiredRecord) throw new Error('Restore window has expired')

        const clearTrashUpdate = {
          deletedAt: null,
          restoreUntil: null,
          deletedByPractitionerId: null,
          deletionGroupId: null,
          deletionType: null,
          deletionReason: null,
          updatedAt: now,
        }

        if (patientRows.length > 0) {
          await tx
            .update(patients)
            .set(clearTrashUpdate)
            .where(inArray(patients.id, patientRows.map(patient => patient.id)))
        }
        if (bookingRows.length > 0) {
          await tx
            .update(bookings)
            .set(clearTrashUpdate)
            .where(inArray(bookings.id, bookingRows.map(booking => booking.id)))
        }
        if (sessionRows.length > 0) {
          await tx
            .update(sessions)
            .set(clearTrashUpdate)
            .where(inArray(sessions.id, sessionRows.map(session => session.id)))
        }

        return {
          restored: totalRecords,
          patientRows,
          bookingRows,
          sessionRows,
          serviceRows: [] as ServiceRow[],
        }
      })

      clearTrashFromRuntime(practitionerId, deletionGroupId)
      for (const patientRow of result.patientRows) {
        const publicPatientId = publicPatientIdForRow(patientRow)
        await patientsRepository.getById(practitionerId, publicPatientId)
      }
      for (const patientRow of result.patientRows) {
        const publicPatientId = publicPatientIdForRow(patientRow)
        await bookingsRepository.listByPatient(practitionerId, publicPatientId)
        await sessionsRepository.listByPatient(practitionerId, publicPatientId)
      }
      for (const bookingRow of result.bookingRows) {
        await bookingsRepository.getById(practitionerId, publicBookingIdForRow(bookingRow))
      }
      for (const sessionRow of result.sessionRows) {
        await sessionsRepository.getById(practitionerId, publicSessionIdForRow(sessionRow))
      }
      for (const serviceRow of result.serviceRows) {
        await servicesRepository.getById(practitionerId, publicServiceIdForRow(serviceRow))
      }
      return { restored: result.restored, deletionGroupId }
    },
    () => fallbackRestoreDeletionGroup(practitionerId, deletionGroupId, options),
  )
}

export async function purgeExpiredTrash(options: { now?: Date; practitionerId?: string } = {}) {
  if (isTestRuntime()) return purgeExpiredTrashInMemory(options.now)

  const dbPractitionerId = options.practitionerId
    ? databasePractitionerId(options.practitionerId)
    : undefined
  if (options.practitionerId && !dbPractitionerId) {
    return purgeExpiredTrashInMemory(options.now)
  }

  return runWithFallback(
    async () => {
      const now = options.now ?? new Date()
      const purgedRuntime = {
        patients: [] as PatientRow[],
        bookings: [] as BookingRow[],
        sessions: [] as SessionRow[],
        services: [] as ServiceRow[],
      }

      const counts = await drizzleDb.transaction(async tx => {
        const groupConditions = [lt(deletionGroups.restoreUntil, now)]
        if (dbPractitionerId) groupConditions.push(eq(deletionGroups.practitionerId, dbPractitionerId))

        const expiredGroups = await tx
          .select()
          .from(deletionGroups)
          .where(and(...groupConditions))

        const removed = { patients: 0, bookings: 0, sessions: 0, services: 0 }

        for (const group of expiredGroups) {
          const patientRows = await tx
            .select()
            .from(patients)
            .where(
              and(
                eq(patients.practitionerId, group.practitionerId),
                eq(patients.deletionGroupId, group.id),
              ),
            )
          const bookingRows = await tx
            .select()
            .from(bookings)
            .where(
              and(
                eq(bookings.practitionerId, group.practitionerId),
                eq(bookings.deletionGroupId, group.id),
              ),
            )
          const sessionRows = await tx
            .select()
            .from(sessions)
            .where(
              and(
                eq(sessions.practitionerId, group.practitionerId),
                eq(sessions.deletionGroupId, group.id),
              ),
            )
          const serviceRows = await tx
            .select()
            .from(servicesTable)
            .where(
              and(
                eq(servicesTable.practitionerId, group.practitionerId),
                eq(servicesTable.deletionGroupId, group.id),
              ),
            )

          if (group.deletionType === 'patient-data') {
            const groupRows = [...patientRows, ...bookingRows, ...sessionRows]
            if (groupRows.length === 0) {
              await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))
              continue
            }
            if (!allRowsExpired(groupRows, now)) continue

            if (sessionRows.length > 0) {
              await tx.delete(sessions).where(inArray(sessions.id, sessionRows.map(session => session.id)))
            }
            if (bookingRows.length > 0) {
              await tx.delete(bookings).where(inArray(bookings.id, bookingRows.map(booking => booking.id)))
            }
            if (patientRows.length > 0) {
              await tx.delete(patients).where(inArray(patients.id, patientRows.map(patient => patient.id)))
            }
            await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))

            removed.patients += patientRows.length
            removed.bookings += bookingRows.length
            removed.sessions += sessionRows.length
            purgedRuntime.patients.push(...patientRows)
            purgedRuntime.bookings.push(...bookingRows)
            purgedRuntime.sessions.push(...sessionRows)
            continue
          }

          if (group.deletionType === 'booking') {
            if (bookingRows.length === 0) {
              await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))
              continue
            }
            if (!allRowsExpired(bookingRows, now)) continue

            await tx.delete(bookings).where(inArray(bookings.id, bookingRows.map(booking => booking.id)))
            await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))

            removed.bookings += bookingRows.length
            purgedRuntime.bookings.push(...bookingRows)
            continue
          }

          if (group.deletionType === 'session') {
            if (sessionRows.length === 0) {
              await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))
              continue
            }
            if (!allRowsExpired(sessionRows, now)) continue

            await tx.delete(sessions).where(inArray(sessions.id, sessionRows.map(session => session.id)))
            await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))

            removed.sessions += sessionRows.length
            purgedRuntime.sessions.push(...sessionRows)
            continue
          }

          if (group.deletionType === 'service') {
            if (serviceRows.length === 0) {
              await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))
              continue
            }
            if (!allRowsExpired(serviceRows, now)) continue

            await tx
              .delete(servicesTable)
              .where(inArray(servicesTable.id, serviceRows.map(service => service.id)))
            await tx.delete(deletionGroups).where(eq(deletionGroups.id, group.id))

            removed.services += serviceRows.length
            purgedRuntime.services.push(...serviceRows)
          }
        }

        return removed
      })

      const databasePractitionerIdToPublicId = Object.fromEntries(
        Object.entries(databasePractitionerIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
      ) as Record<string, string>

      for (const patient of purgedRuntime.patients) {
        removeRuntimePatient(databasePractitionerIdToPublicId[patient.practitionerId] ?? patient.practitionerId, patient)
      }
      for (const booking of purgedRuntime.bookings) {
        removeRuntimeBooking(databasePractitionerIdToPublicId[booking.practitionerId] ?? booking.practitionerId, booking)
      }
      for (const session of purgedRuntime.sessions) {
        removeRuntimeSession(databasePractitionerIdToPublicId[session.practitionerId] ?? session.practitionerId, session)
      }
      for (const service of purgedRuntime.services) {
        removeRuntimeService(databasePractitionerIdToPublicId[service.practitionerId] ?? service.practitionerId, service)
      }

      return counts
    },
    () => purgeExpiredTrashInMemory(options.now),
  )
}

export async function buildPatientExport(practitionerId: string, patientId: string) {
  const fallback = async () => {
    await mirrorPatientForLifecycle(practitionerId, patientId)
    await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
    await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
    return buildPatientFullExport(patientId, practitionerId)
  }

  if (isTestRuntime()) return fallback()

  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallback()

  return runWithFallback(
    async () => {
      const patientRows = await drizzleDb
        .select()
        .from(patients)
        .where(and(patientIdCondition(patientId), eq(patients.practitionerId, dbPractitionerId)))
        .limit(1)

      const patientRow = patientRows[0]
      if (!patientRow) throw new Error('Patient not found')

      const [bookingRows, sessionRows] = await Promise.all([
        drizzleDb
          .select()
          .from(bookings)
          .where(and(eq(bookings.practitionerId, dbPractitionerId), eq(bookings.patientId, patientRow.id))),
        drizzleDb
          .select()
          .from(sessions)
          .where(and(eq(sessions.practitionerId, dbPractitionerId), eq(sessions.patientId, patientRow.id))),
      ])
      const maps = await loadExportPublicIdMaps(bookingRows, sessionRows)
      const publicPatientId = publicPatientIdForRow(patientRow)

      return {
        exportedAt: new Date().toISOString(),
        practitionerId,
        patient: toExportPatient(patientRow),
        bookings: bookingRows.map(row => toExportBooking(row, publicPatientId, maps)),
        sessions: sessionRows.map(row => toExportSession(row, publicPatientId, maps)),
      }
    },
    fallback,
  )
}
