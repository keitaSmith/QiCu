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
import { sessionsStore } from '@/data/sessionsStore'
import { drizzleDb } from '@/db/client'
import { bookings, deletionGroups, patients, sessions } from '@/db/schema'
import { demoPatientIds, demoPractitionerIds } from '@/db/seeds/ids'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import { patientsStore } from '@/data/patientsStore'
import { getPatientPractitionerId, patientBelongsToPractitioner } from '@/lib/practitioners'
import type { TrashMetadata } from '@/models/lifecycle'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'

const RESTORE_WINDOW_DAYS = 30

const databasePractitionerIdByPublicId = demoPractitionerIds
const databasePatientIdByPublicId = demoPatientIds
const publicPatientIdByDatabaseId = Object.fromEntries(
  Object.entries(databasePatientIdByPublicId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

type PatientRow = typeof patients.$inferSelect
type BookingRow = typeof bookings.$inferSelect
type SessionRow = typeof sessions.$inferSelect

function databasePractitionerId(practitionerId: string) {
  return databasePractitionerIdByPublicId[
    practitionerId as keyof typeof databasePractitionerIdByPublicId
  ]
}

function databasePatientId(patientId: string) {
  return databasePatientIdByPublicId[patientId as keyof typeof databasePatientIdByPublicId] ?? patientId
}

function publicPatientIdForRow(row: PatientRow) {
  return row.publicId ?? publicPatientIdByDatabaseId[row.id] ?? row.id
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

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => Promise<T> | T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
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
  deletionReason?: string | null,
): TrashMetadata {
  return {
    deletedAt: deletedAt.toISOString(),
    restoreUntil: restoreUntil.toISOString(),
    deletedByPractitionerId: practitionerId,
    deletionGroupId,
    deletionType: 'patient-data',
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

export async function moveSessionToTrash(
  practitionerId: string,
  sessionId: string,
  options: { now?: Date } = {},
) {
  await sessionsRepository.getById(practitionerId, sessionId)
  const result = moveSessionToTrashInMemory(sessionId, practitionerId, options.now)
  await sessionsRepository.syncRuntimeSessionToDatabase(practitionerId, sessionId)
  return result
}

export function getServiceLifecycleImpact(practitionerId: string, serviceId: string) {
  return getServiceLifecycleImpactInMemory(serviceId, practitionerId)
}

export function moveServiceToTrash(
  practitionerId: string,
  serviceId: string,
  options: { now?: Date } = {},
) {
  return moveServiceToTrashInMemory(serviceId, practitionerId, options.now)
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
              eq(deletionGroups.deletionType, 'patient-data'),
            ),
          )
          .limit(1)

        const group = groupRows[0]
        if (!group) throw new Error('Deletion group not found')

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

        return { restored: totalRecords, patientRows }
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
      return { restored: result.restored, deletionGroupId }
    },
    () => fallbackRestoreDeletionGroup(practitionerId, deletionGroupId, options),
  )
}

export function purgeExpiredTrash(options: { now?: Date } = {}) {
  return purgeExpiredTrashInMemory(options.now)
}

export async function buildPatientExport(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
  await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
  return buildPatientFullExport(patientId, practitionerId)
}
