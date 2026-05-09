import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import {
  archivePatient,
  buildPatientFullExport,
  getPatientLifecycleImpact,
  isActiveRecord,
  isArchived,
  isTrashed,
  moveBookingToTrash,
  movePatientGraphToTrash,
  moveServiceToTrash,
  moveSessionToTrash,
  purgeExpiredTrash,
  reactivatePatient,
  restoreDeletionGroup,
} from '@/lib/dataLifecycle'
import { setPatientPractitionerId } from '@/lib/practitioners'
import type { Booking } from '@/models/booking'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'

const practitionerId = 'prac-lifecycle-test'

function cleanup() {
  for (let index = patientsStore.length - 1; index >= 0; index -= 1) {
    if (patientsStore[index].id.startsWith('P-LIFE-')) patientsStore.splice(index, 1)
  }
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id.startsWith('b-life-')) BOOKINGS.splice(index, 1)
  }
  for (let index = sessionsStore.length - 1; index >= 0; index -= 1) {
    if (sessionsStore[index].id.startsWith('S-LIFE-')) sessionsStore.splice(index, 1)
  }
  for (let index = servicesStore.length - 1; index >= 0; index -= 1) {
    if (servicesStore[index].id.startsWith('svc-life-')) servicesStore.splice(index, 1)
  }
}

function addPatient(id = 'P-LIFE-1'): FhirPatient {
  const patient = setPatientPractitionerId(
    {
      resourceType: 'Patient',
      id,
      active: true,
      name: [{ text: 'Lifecycle Patient', family: 'Patient', given: ['Lifecycle'] }],
    },
    practitionerId,
  )
  patientsStore.push(patient)
  return patient
}

function addBooking(input: Partial<Booking> = {}): Booking {
  const booking: Booking = {
    id: input.id ?? `b-life-${Math.random().toString(36).slice(2, 8)}`,
    practitionerId: input.practitionerId ?? practitionerId,
    code: input.code ?? 'BKG-LIFE',
    patientId: input.patientId ?? 'P-LIFE-1',
    serviceId: input.serviceId ?? 'svc-life-1',
    serviceName: input.serviceName ?? 'Lifecycle Service',
    serviceDurationMinutes: input.serviceDurationMinutes ?? 45,
    start: input.start ?? '2026-05-05T10:00:00.000Z',
    end: input.end ?? '2026-05-05T10:45:00.000Z',
    status: input.status ?? 'confirmed',
    sessionId: input.sessionId,
  }
  BOOKINGS.push(booking)
  return booking
}

function addSession(input: Partial<Session> = {}): Session {
  const session: Session = {
    id: input.id ?? `S-LIFE-${Math.random().toString(36).slice(2, 8)}`,
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-LIFE-1',
    bookingId: input.bookingId,
    startDateTime: input.startDateTime ?? '2026-05-05T10:00:00.000Z',
    serviceId: input.serviceId ?? 'svc-life-1',
    serviceName: input.serviceName ?? 'Lifecycle Service',
    chiefComplaint: input.chiefComplaint ?? 'Lifecycle test',
  }
  sessionsStore.push(session)
  return session
}

function addService(input: Partial<Service> = {}): Service {
  const service: Service = {
    id: input.id ?? 'svc-life-1',
    practitionerId: input.practitionerId ?? practitionerId,
    name: input.name ?? 'Lifecycle Service',
    durationMinutes: input.durationMinutes ?? 45,
    active: input.active ?? true,
  }
  servicesStore.push(service)
  return service
}

afterEach(cleanup)

test('patient lifecycle impact counts past bookings, future bookings, sessions, and practitioner scope', () => {
  cleanup()
  addPatient()
  addBooking({ id: 'b-life-past', start: '2026-05-01T10:00:00.000Z', end: '2026-05-01T10:45:00.000Z' })
  addBooking({ id: 'b-life-future', start: '2026-06-08T10:00:00.000Z', end: '2026-06-08T10:45:00.000Z' })
  addBooking({ id: 'b-life-future-cancelled', start: '2026-06-09T10:00:00.000Z', end: '2026-06-09T10:45:00.000Z', status: 'cancelled' })
  addBooking({ id: 'b-life-other-prac', practitionerId: 'other-prac', start: '2026-06-08T10:00:00.000Z' })
  addSession({ id: 'S-LIFE-1' })
  addSession({ id: 'S-LIFE-other', practitionerId: 'other-prac' })

  const impact = getPatientLifecycleImpact('P-LIFE-1', practitionerId)

  assert.equal(impact.pastBookings, 1)
  assert.equal(impact.futureBookings, 1)
  assert.equal(impact.sessions, 1)
  assert.equal(impact.totalLinkedRecords, 4)
})

test('archive patient hides patient from active workflow but keeps history out of Trash', () => {
  cleanup()
  const patient = addPatient()
  const booking = addBooking({ id: 'b-life-history' })
  const session = addSession({ id: 'S-LIFE-history' })

  const result = archivePatient(patient.id, practitionerId)

  assert.equal(result.patient.active, false)
  assert.equal(isTrashed(patient), false)
  assert.equal(isArchived(patient), true)
  assert.equal(isActiveRecord(patient), false)
  assert.equal(isTrashed(booking), false)
  assert.equal(isTrashed(session), false)

  const reactivated = reactivatePatient(patient.id, practitionerId)
  assert.equal(reactivated.active, true)
  assert.equal(isArchived(reactivated), false)
  assert.equal(isActiveRecord(reactivated), true)
})

test('archive patient with no future bookings keeps history unchanged', () => {
  cleanup()
  const patient = addPatient()
  const pastStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const pastBooking = addBooking({
    id: 'b-life-archive-past',
    start: pastStart,
    end: new Date(new Date(pastStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'completed',
  })
  const session = addSession({ id: 'S-LIFE-archive-past', bookingId: pastBooking.id })

  const result = archivePatient(patient.id, practitionerId)

  assert.equal(result.impact.futureBookings, 0)
  assert.equal(patient.active, false)
  assert.equal(pastBooking.status, 'completed')
  assert.equal(isTrashed(pastBooking), false)
  assert.equal(isTrashed(session), false)
})

test('archive patient keeps upcoming bookings active when requested', () => {
  cleanup()
  const patient = addPatient()
  const futureStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const futureBooking = addBooking({
    id: 'b-life-archive-future-keep',
    start: futureStart,
    end: new Date(new Date(futureStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'confirmed',
  })
  const session = addSession({ id: 'S-LIFE-archive-future-keep' })

  archivePatient(patient.id, practitionerId, { cancelFutureBookings: false })

  assert.equal(patient.active, false)
  assert.equal(futureBooking.status, 'confirmed')
  assert.equal(isTrashed(futureBooking), false)
  assert.equal(isTrashed(session), false)
})

test('archive patient can cancel only that patient practitioner future bookings', () => {
  cleanup()
  const patient = addPatient()
  const futureStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const pastStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const futureBooking = addBooking({
    id: 'b-life-archive-future-cancel',
    start: futureStart,
    end: new Date(new Date(futureStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'confirmed',
  })
  const pastBooking = addBooking({
    id: 'b-life-archive-past-unchanged',
    start: pastStart,
    end: new Date(new Date(pastStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'completed',
  })
  const otherPractitionerBooking = addBooking({
    id: 'b-life-archive-other-practitioner',
    practitionerId: 'other-prac',
    start: futureStart,
    end: new Date(new Date(futureStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'confirmed',
  })
  const alreadyCancelledFutureBooking = addBooking({
    id: 'b-life-archive-already-cancelled',
    start: futureStart,
    end: new Date(new Date(futureStart).getTime() + 45 * 60 * 1000).toISOString(),
    status: 'cancelled',
  })
  const session = addSession({ id: 'S-LIFE-archive-cancel' })

  archivePatient(patient.id, practitionerId, { cancelFutureBookings: true })

  assert.equal(patient.active, false)
  assert.equal(futureBooking.status, 'cancelled')
  assert.equal(pastBooking.status, 'completed')
  assert.equal(otherPractitionerBooking.status, 'confirmed')
  assert.equal(alreadyCancelledFutureBooking.status, 'cancelled')
  assert.equal(isTrashed(futureBooking), false)
  assert.equal(isTrashed(pastBooking), false)
  assert.equal(isTrashed(session), false)
})

test('delete patient data moves patient, bookings, and sessions to one deletion group and restores them', () => {
  cleanup()
  const patient = addPatient()
  const booking = addBooking({ id: 'b-life-delete' })
  const session = addSession({ id: 'S-LIFE-delete' })

  const deleted = movePatientGraphToTrash(patient.id, practitionerId, new Date('2026-05-04T12:00:00.000Z'))

  assert.equal(isTrashed(patient), true)
  assert.equal(isTrashed(booking), true)
  assert.equal(isTrashed(session), true)
  assert.equal(patient.trashMetadata?.deletedAt, '2026-05-04T12:00:00.000Z')
  assert.equal(patient.trashMetadata?.restoreUntil, '2026-06-03T12:00:00.000Z')
  assert.equal(patient.trashMetadata?.deletedByPractitionerId, practitionerId)
  assert.equal(patient.trashMetadata?.deletionGroupId, deleted.deletionGroupId)
  assert.equal(booking.trashMetadata?.deletionGroupId, deleted.deletionGroupId)
  assert.equal(session.trashMetadata?.deletionGroupId, deleted.deletionGroupId)
  assert.equal(isActiveRecord(patient), false)

  restoreDeletionGroup(deleted.deletionGroupId, practitionerId, new Date('2026-05-20T12:00:00.000Z'))

  assert.equal(isTrashed(patient), false)
  assert.equal(isTrashed(booking), false)
  assert.equal(isTrashed(session), false)
})

test('restore is blocked after restoreUntil', () => {
  cleanup()
  const patient = addPatient()
  const deleted = movePatientGraphToTrash(patient.id, practitionerId, new Date('2026-05-04T12:00:00.000Z'))

  assert.throws(
    () => restoreDeletionGroup(deleted.deletionGroupId, practitionerId, new Date('2026-06-10T12:00:00.000Z')),
    /expired/,
  )
})

test('restore respects practitioner scoping', () => {
  cleanup()
  const patient = addPatient()
  const deleted = movePatientGraphToTrash(patient.id, practitionerId, new Date('2026-05-04T12:00:00.000Z'))

  assert.throws(
    () => restoreDeletionGroup(deleted.deletionGroupId, 'other-practitioner', new Date('2026-05-20T12:00:00.000Z')),
    /not found/,
  )
  assert.equal(isTrashed(patient), true)
})

test('restore fails when any record in the deletion group is outside the restore window', () => {
  cleanup()
  const patient = addPatient()
  const booking = addBooking({ id: 'b-life-expired-child' })
  const deleted = movePatientGraphToTrash(patient.id, practitionerId, new Date('2026-05-04T12:00:00.000Z'))
  if (!booking.trashMetadata) throw new Error('Expected booking trash metadata')
  booking.trashMetadata.restoreUntil = '2026-05-10T12:00:00.000Z'

  assert.throws(
    () => restoreDeletionGroup(deleted.deletionGroupId, practitionerId, new Date('2026-05-20T12:00:00.000Z')),
    /expired/,
  )
  assert.equal(isTrashed(patient), true)
  assert.equal(isTrashed(booking), true)
})

test('booking delete moves booking to Trash and unlinks active sessions', () => {
  cleanup()
  addPatient()
  const booking = addBooking({ id: 'b-life-booking-delete', sessionId: 'S-LIFE-linked' })
  const session = addSession({ id: 'S-LIFE-linked', bookingId: booking.id })

  moveBookingToTrash(booking.id, practitionerId)

  assert.equal(isTrashed(booking), true)
  assert.equal(isTrashed(session), false)
  assert.equal(session.bookingId, null)
})

test('restoring an individual booking restores only that booking', () => {
  cleanup()
  addPatient()
  const booking = addBooking({ id: 'b-life-booking-restore' })
  const otherBooking = addBooking({ id: 'b-life-booking-other' })

  const deleted = moveBookingToTrash(booking.id, practitionerId)
  restoreDeletionGroup(deleted.deletionGroupId, practitionerId)

  assert.equal(isTrashed(booking), false)
  assert.equal(isTrashed(otherBooking), false)
  assert.equal(otherBooking.trashMetadata, undefined)
})

test('session delete moves session to Trash and unlinks active booking', () => {
  cleanup()
  addPatient()
  const booking = addBooking({ id: 'b-life-session-link', sessionId: 'S-LIFE-session-delete' })
  const session = addSession({ id: 'S-LIFE-session-delete', bookingId: booking.id })

  moveSessionToTrash(session.id, practitionerId)

  assert.equal(isTrashed(session), true)
  assert.equal(isTrashed(booking), false)
  assert.equal(booking.sessionId, undefined)
})

test('restoring an individual session restores only that session', () => {
  cleanup()
  addPatient()
  const session = addSession({ id: 'S-LIFE-session-restore' })
  const otherSession = addSession({ id: 'S-LIFE-session-other' })

  const deleted = moveSessionToTrash(session.id, practitionerId)
  restoreDeletionGroup(deleted.deletionGroupId, practitionerId)

  assert.equal(isTrashed(session), false)
  assert.equal(isTrashed(otherSession), false)
  assert.equal(otherSession.trashMetadata, undefined)
})

test('service archive is separate from service Trash delete and historical records remain readable', () => {
  cleanup()
  const service = addService()
  addPatient()
  const booking = addBooking({ serviceId: service.id, serviceName: service.name })
  const session = addSession({ serviceId: service.id, serviceName: service.name })

  service.active = false
  assert.equal(service.active, false)
  assert.equal(isTrashed(service), false)

  moveServiceToTrash(service.id, practitionerId)

  assert.equal(isTrashed(service), true)
  assert.equal(booking.serviceName, 'Lifecycle Service')
  assert.equal(session.serviceName, 'Lifecycle Service')
  assert.equal(isTrashed(booking), false)
  assert.equal(isTrashed(session), false)

  assert.throws(() => moveServiceToTrash(service.id, 'other-practitioner'), /not found/)
})

test('patient export includes profile, linked bookings, and linked sessions with practitioner scope', () => {
  cleanup()
  addPatient()
  addBooking({ id: 'b-life-export' })
  addBooking({ id: 'b-life-export-other', practitionerId: 'other-prac' })
  addSession({ id: 'S-LIFE-export' })

  const exported = buildPatientFullExport('P-LIFE-1', practitionerId)

  assert.equal(exported.patient.id, 'P-LIFE-1')
  assert.equal(exported.bookings.length, 1)
  assert.equal(exported.sessions.length, 1)
})

test('purgeExpiredTrash removes expired records and keeps records inside restore period', () => {
  cleanup()
  const expiredPatient = addPatient('P-LIFE-expired')
  const retainedPatient = addPatient('P-LIFE-retained')
  movePatientGraphToTrash(expiredPatient.id, practitionerId, new Date('2026-04-01T12:00:00.000Z'))
  movePatientGraphToTrash(retainedPatient.id, practitionerId, new Date('2026-05-01T12:00:00.000Z'))

  const removed = purgeExpiredTrash(new Date('2026-05-04T12:00:00.000Z'))

  assert.equal(removed.patients, 1)
  assert.equal(patientsStore.some(patient => patient.id === expiredPatient.id), false)
  assert.equal(patientsStore.some(patient => patient.id === retainedPatient.id), true)
})
