import {
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
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import { patientsStore } from '@/data/patientsStore'
import { getPatientPractitionerId } from '@/lib/practitioners'

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

export async function reactivatePatient(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  const patient = reactivatePatientInMemory(patientId, practitionerId)
  await patientsRepository.syncRuntimePatientToDatabase(practitionerId, patientId)
  return patient
}

export async function movePatientGraphToTrash(
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

export function purgeExpiredTrash(options: { now?: Date } = {}) {
  return purgeExpiredTrashInMemory(options.now)
}

export async function buildPatientExport(practitionerId: string, patientId: string) {
  await mirrorPatientForLifecycle(practitionerId, patientId)
  await mirrorPatientBookingsForLifecycle(practitionerId, patientId)
  await mirrorPatientSessionsForLifecycle(practitionerId, patientId)
  return buildPatientFullExport(patientId, practitionerId)
}
