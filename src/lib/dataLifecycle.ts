import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import type { Booking } from '@/models/booking'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'
import type { LifecycleFields, TrashMetadata } from '@/models/lifecycle'
import { isActiveRecord, isArchived, isTrashed } from '@/lib/lifecycleState'
import {
  getPatientPractitionerId,
  patientBelongsToPractitioner,
} from '@/lib/practitioners'

const RESTORE_WINDOW_DAYS = 30

type TrashableRecord = Booking | Session | Service | FhirPatient

export type PatientLifecycleImpact = {
  pastBookings: number
  futureBookings: number
  sessions: number
  bookings: number
  totalLinkedRecords: number
}

export { isActiveRecord, isArchived, isTrashed }

export function createDeletionGroup() {
  return `trash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function restoreUntilFrom(deletedAt: Date) {
  const restoreUntil = new Date(deletedAt)
  restoreUntil.setDate(restoreUntil.getDate() + RESTORE_WINDOW_DAYS)
  return restoreUntil
}

function buildTrashMetadata(
  practitionerId: string,
  deletionGroupId: string,
  deletionType: TrashMetadata['deletionType'],
  now = new Date(),
  deletionReason?: string,
): TrashMetadata {
  return {
    deletedAt: now.toISOString(),
    restoreUntil: restoreUntilFrom(now).toISOString(),
    deletedByPractitionerId: practitionerId,
    deletionGroupId,
    deletionType,
    deletionReason,
  }
}

function moveToTrash(
  record: TrashableRecord,
  practitionerId: string,
  deletionGroupId: string,
  deletionType: TrashMetadata['deletionType'],
  now = new Date(),
  deletionReason?: string,
) {
  record.trashMetadata = buildTrashMetadata(
    practitionerId,
    deletionGroupId,
    deletionType,
    now,
    deletionReason,
  )
}

function bookingBelongsToPatient(booking: Booking, patientId: string, practitionerId: string) {
  return booking.patientId === patientId && booking.practitionerId === practitionerId
}

function sessionBelongsToPatient(session: Session, patientId: string, practitionerId: string) {
  return session.patientId === patientId && session.practitionerId === practitionerId
}

function isActiveUpcomingBooking(booking: Booking, now: number) {
  return String(booking.status).toLowerCase() !== 'cancelled' && new Date(booking.start).getTime() > now
}

export function getPatientLifecycleImpact(patientId: string, practitionerId: string): PatientLifecycleImpact {
  const now = Date.now()
  const linkedBookings = BOOKINGS.filter(
    booking => bookingBelongsToPatient(booking, patientId, practitionerId) && !isTrashed(booking),
  )
  const linkedSessions = sessionsStore.filter(
    session => sessionBelongsToPatient(session, patientId, practitionerId) && !isTrashed(session),
  )
  const futureBookings = linkedBookings.filter(booking => isActiveUpcomingBooking(booking, now)).length
  const pastBookings = linkedBookings.filter(booking => new Date(booking.start).getTime() <= now).length

  return {
    pastBookings,
    futureBookings,
    sessions: linkedSessions.length,
    bookings: linkedBookings.length,
    totalLinkedRecords: linkedBookings.length + linkedSessions.length,
  }
}

export function archivePatient(
  patientId: string,
  practitionerId: string,
  options?: { cancelFutureBookings?: boolean },
) {
  const patient = patientsStore.find(
    item => item.id === patientId && patientBelongsToPractitioner(item, practitionerId) && !isTrashed(item),
  )
  if (!patient) throw new Error('Patient not found')

  const impact = getPatientLifecycleImpact(patientId, practitionerId)
  patient.active = false

  if (options?.cancelFutureBookings) {
    const now = Date.now()
    for (const booking of BOOKINGS) {
      if (
        bookingBelongsToPatient(booking, patientId, practitionerId) &&
        !isTrashed(booking) &&
        isActiveUpcomingBooking(booking, now)
      ) {
        booking.status = 'cancelled'
        booking.statusUpdatedAt = new Date().toISOString()
      }
    }
  }

  return { patient, impact }
}

export function reactivatePatient(patientId: string, practitionerId: string) {
  const patient = patientsStore.find(
    item => item.id === patientId && patientBelongsToPractitioner(item, practitionerId) && !isTrashed(item),
  )
  if (!patient) throw new Error('Patient not found')
  patient.active = true
  return patient
}

export function movePatientGraphToTrash(patientId: string, practitionerId: string, now = new Date()) {
  const patient = patientsStore.find(
    item => item.id === patientId && patientBelongsToPractitioner(item, practitionerId) && !isTrashed(item),
  )
  if (!patient) throw new Error('Patient not found')

  const deletionGroupId = createDeletionGroup()
  const bookings = BOOKINGS.filter(booking => bookingBelongsToPatient(booking, patientId, practitionerId) && !isTrashed(booking))
  const sessions = sessionsStore.filter(session => sessionBelongsToPatient(session, patientId, practitionerId) && !isTrashed(session))

  moveToTrash(patient, practitionerId, deletionGroupId, 'patient-data', now)
  for (const booking of bookings) moveToTrash(booking, practitionerId, deletionGroupId, 'patient-data', now)
  for (const session of sessions) moveToTrash(session, practitionerId, deletionGroupId, 'patient-data', now)

  return {
    patient,
    restoreUntil: patient.trashMetadata?.restoreUntil,
    deletionGroupId,
    impact: {
      bookings: bookings.length,
      sessions: sessions.length,
    },
  }
}

export function restoreDeletionGroup(deletionGroupId: string, practitionerId: string, now = new Date()) {
  const records = [
    ...patientsStore.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId && getPatientPractitionerId(item) === practitionerId),
    ...BOOKINGS.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId && item.practitionerId === practitionerId),
    ...sessionsStore.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId && item.practitionerId === practitionerId),
    ...servicesStore.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId && item.practitionerId === practitionerId),
  ]

  if (records.length === 0) throw new Error('Deletion group not found')

  const hasExpiredRecord = records.some(record => {
    const restoreUntil = record.trashMetadata?.restoreUntil
    return !restoreUntil || new Date(restoreUntil).getTime() < now.getTime()
  })

  if (hasExpiredRecord) {
    throw new Error('Restore window has expired')
  }

  for (const record of records) {
    delete record.trashMetadata
  }

  return { restored: records.length, deletionGroupId }
}

export function moveBookingToTrash(bookingId: string, practitionerId: string, now = new Date()) {
  const booking = BOOKINGS.find(item => item.id === bookingId && item.practitionerId === practitionerId && !isTrashed(item))
  if (!booking) throw new Error('Booking not found')

  const deletionGroupId = createDeletionGroup()
  moveToTrash(booking, practitionerId, deletionGroupId, 'booking', now)

  for (const session of sessionsStore) {
    if (session.bookingId === bookingId && session.practitionerId === practitionerId && !isTrashed(session)) {
      session.bookingId = null
    }
  }

  return { booking, restoreUntil: booking.trashMetadata?.restoreUntil, deletionGroupId }
}

export function moveSessionToTrash(sessionId: string, practitionerId: string, now = new Date()) {
  const session = sessionsStore.find(item => item.id === sessionId && item.practitionerId === practitionerId && !isTrashed(item))
  if (!session) throw new Error('Session not found')

  const deletionGroupId = createDeletionGroup()
  moveToTrash(session, practitionerId, deletionGroupId, 'session', now)

  for (const booking of BOOKINGS) {
    if (booking.sessionId === sessionId && booking.practitionerId === practitionerId && !isTrashed(booking)) {
      booking.sessionId = undefined
    }
  }

  return { session, restoreUntil: session.trashMetadata?.restoreUntil, deletionGroupId }
}

export function moveServiceToTrash(serviceId: string, practitionerId: string, now = new Date()) {
  const service = servicesStore.find(item => item.id === serviceId && item.practitionerId === practitionerId && !isTrashed(item))
  if (!service) throw new Error('Service not found')

  const deletionGroupId = createDeletionGroup()
  moveToTrash(service, practitionerId, deletionGroupId, 'service', now)

  return {
    service,
    restoreUntil: service.trashMetadata?.restoreUntil,
    deletionGroupId,
    impact: getServiceLifecycleImpact(serviceId, practitionerId),
  }
}

export function getServiceLifecycleImpact(serviceId: string, practitionerId: string) {
  return {
    bookings: BOOKINGS.filter(item => item.serviceId === serviceId && item.practitionerId === practitionerId && !isTrashed(item)).length,
    sessions: sessionsStore.filter(item => item.serviceId === serviceId && item.practitionerId === practitionerId && !isTrashed(item)).length,
  }
}

export function purgeExpiredTrash(now = new Date()) {
  const isExpired = (record: LifecycleFields) =>
    Boolean(record.trashMetadata && new Date(record.trashMetadata.restoreUntil).getTime() < now.getTime())

  const removeExpired = <T extends LifecycleFields>(records: T[]) => {
    let removed = 0
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (isExpired(records[index])) {
        records.splice(index, 1)
        removed += 1
      }
    }
    return removed
  }

  return {
    patients: removeExpired(patientsStore),
    bookings: removeExpired(BOOKINGS),
    sessions: removeExpired(sessionsStore),
    services: removeExpired(servicesStore),
  }
}

export function buildPatientFullExport(patientId: string, practitionerId: string) {
  const patient = patientsStore.find(
    item => item.id === patientId && patientBelongsToPractitioner(item, practitionerId),
  )
  if (!patient) throw new Error('Patient not found')

  const bookings = BOOKINGS.filter(booking => bookingBelongsToPatient(booking, patientId, practitionerId))
  const sessions = sessionsStore.filter(session => sessionBelongsToPatient(session, patientId, practitionerId))

  return {
    exportedAt: new Date().toISOString(),
    practitionerId,
    patient,
    bookings,
    sessions,
  }
}

export function listTrash(practitionerId: string) {
  return {
    patients: patientsStore.filter(item => getPatientPractitionerId(item) === practitionerId && isTrashed(item)),
    bookings: BOOKINGS.filter(item => item.practitionerId === practitionerId && isTrashed(item)),
    sessions: sessionsStore.filter(item => item.practitionerId === practitionerId && isTrashed(item)),
    services: servicesStore.filter(item => item.practitionerId === practitionerId && isTrashed(item)),
  }
}
