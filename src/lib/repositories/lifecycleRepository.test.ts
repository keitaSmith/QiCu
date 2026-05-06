import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import { isArchived, isTrashed } from '@/lib/dataLifecycle'
import { setPatientPractitionerId } from '@/lib/practitioners'
import type { Booking } from '@/models/booking'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'
import {
  archivePatient,
  buildPatientExport,
  disableService,
  getPatientLifecycleImpact,
  moveBookingToTrash,
  movePatientGraphToTrash,
  moveServiceToTrash,
  moveSessionToTrash,
  purgeExpiredTrash,
  reactivatePatient,
  restoreDeletionGroup,
} from './lifecycleRepository'

const practitionerId = 'prac-repo-life'

function cleanup() {
  for (let index = patientsStore.length - 1; index >= 0; index -= 1) {
    if (patientsStore[index].id.startsWith('P-REPO-LIFE')) patientsStore.splice(index, 1)
  }
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id.startsWith('b-repo-life')) BOOKINGS.splice(index, 1)
  }
  for (let index = sessionsStore.length - 1; index >= 0; index -= 1) {
    if (sessionsStore[index].id.startsWith('S-REPO-LIFE')) sessionsStore.splice(index, 1)
  }
  for (let index = servicesStore.length - 1; index >= 0; index -= 1) {
    if (servicesStore[index].id.startsWith('svc-repo-life')) servicesStore.splice(index, 1)
  }
}

function addPatient(id = 'P-REPO-LIFE-1'): FhirPatient {
  const patient = setPatientPractitionerId(
    {
      resourceType: 'Patient',
      id,
      active: true,
      name: [{ text: 'Repository Lifecycle Patient', family: 'Patient', given: ['Repository'] }],
    },
    practitionerId,
  )
  patientsStore.push(patient)
  return patient
}

function addBooking(input: Partial<Booking> = {}): Booking {
  const booking: Booking = {
    id: input.id ?? 'b-repo-life-1',
    code: input.code ?? 'BKG-REPO-LIFE',
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-REPO-LIFE-1',
    serviceId: input.serviceId ?? 'svc-repo-life-1',
    serviceName: input.serviceName ?? 'Lifecycle Service',
    serviceDurationMinutes: input.serviceDurationMinutes ?? 45,
    start: input.start ?? '2026-05-10T10:00:00.000Z',
    end: input.end ?? '2026-05-10T10:45:00.000Z',
    status: input.status ?? 'confirmed',
    sessionId: input.sessionId,
  }
  BOOKINGS.push(booking)
  return booking
}

function addSession(input: Partial<Session> = {}): Session {
  const session: Session = {
    id: input.id ?? 'S-REPO-LIFE-1',
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-REPO-LIFE-1',
    startDateTime: input.startDateTime ?? '2026-05-10T10:00:00.000Z',
    serviceId: input.serviceId ?? 'svc-repo-life-1',
    serviceName: input.serviceName ?? 'Lifecycle Service',
    chiefComplaint: input.chiefComplaint ?? 'Lifecycle repository test',
    bookingId: input.bookingId,
  }
  sessionsStore.push(session)
  return session
}

function addService(input: Partial<Service> = {}): Service {
  const service: Service = {
    id: input.id ?? 'svc-repo-life-1',
    practitionerId: input.practitionerId ?? practitionerId,
    name: input.name ?? 'Lifecycle Service',
    durationMinutes: input.durationMinutes ?? 45,
    active: input.active ?? true,
  }
  servicesStore.push(service)
  return service
}

afterEach(cleanup)

test('patient impact, archive, reactivate, and export preserve lifecycle behavior', () => {
  cleanup()
  const patient = addPatient()
  addBooking({ id: 'b-repo-life-past', start: '2026-05-01T10:00:00.000Z', end: '2026-05-01T10:45:00.000Z' })
  addBooking({ id: 'b-repo-life-future', start: new Date(Date.now() + 86_400_000).toISOString() })
  addSession({ id: 'S-REPO-LIFE-export' })

  const impact = getPatientLifecycleImpact(practitionerId, patient.id)
  assert.equal(impact.sessions, 1)
  assert.equal(impact.bookings, 2)

  const archived = archivePatient(practitionerId, patient.id)
  assert.equal(archived.patient.active, false)
  assert.equal(isArchived(patient), true)
  assert.equal(isTrashed(patient), false)

  const reactivated = reactivatePatient(practitionerId, patient.id)
  assert.equal(reactivated.active, true)

  const exported = buildPatientExport(practitionerId, patient.id)
  assert.equal(exported.patient.id, patient.id)
  assert.equal(exported.bookings.length, 2)
  assert.equal(exported.sessions.length, 1)
})

test('patient data delete and restore operate as one deletion group', () => {
  cleanup()
  const patient = addPatient()
  const booking = addBooking({ id: 'b-repo-life-group' })
  const session = addSession({ id: 'S-REPO-LIFE-group' })

  const deleted = movePatientGraphToTrash(practitionerId, patient.id, {
    now: new Date('2026-05-04T12:00:00.000Z'),
  })

  assert.equal(isTrashed(patient), true)
  assert.equal(booking.trashMetadata?.deletionGroupId, deleted.deletionGroupId)
  assert.equal(session.trashMetadata?.deletionGroupId, deleted.deletionGroupId)

  restoreDeletionGroup(practitionerId, deleted.deletionGroupId, {
    now: new Date('2026-05-20T12:00:00.000Z'),
  })

  assert.equal(isTrashed(patient), false)
  assert.equal(isTrashed(booking), false)
  assert.equal(isTrashed(session), false)
})

test('restore window and practitioner scoping are preserved', () => {
  cleanup()
  const patient = addPatient()
  const deleted = movePatientGraphToTrash(practitionerId, patient.id, {
    now: new Date('2026-05-04T12:00:00.000Z'),
  })

  assert.throws(
    () => restoreDeletionGroup(practitionerId, deleted.deletionGroupId, { now: new Date('2026-06-10T12:00:00.000Z') }),
    /expired/,
  )
  assert.throws(
    () => restoreDeletionGroup('other-practitioner', deleted.deletionGroupId, { now: new Date('2026-05-20T12:00:00.000Z') }),
    /not found/,
  )
})

test('individual booking and session Trash behavior preserves runtime links', () => {
  cleanup()
  addPatient()
  const booking = addBooking({ id: 'b-repo-life-booking-delete', sessionId: 'S-REPO-LIFE-linked' })
  const session = addSession({ id: 'S-REPO-LIFE-linked', bookingId: booking.id })

  const deletedBooking = moveBookingToTrash(practitionerId, booking.id)
  assert.equal(isTrashed(booking), true)
  assert.equal(session.bookingId, null)

  restoreDeletionGroup(practitionerId, deletedBooking.deletionGroupId)
  assert.equal(isTrashed(booking), false)

  const deletedSession = moveSessionToTrash(practitionerId, session.id)
  assert.equal(isTrashed(session), true)
  assert.equal(booking.sessionId, undefined)

  restoreDeletionGroup(practitionerId, deletedSession.deletionGroupId)
  assert.equal(isTrashed(session), false)
})

test('service disable is separate from service Trash delete', async () => {
  cleanup()
  const service = addService()

  const disabled = await disableService(practitionerId, service.id)
  assert.equal(disabled?.active, false)
  assert.equal(isTrashed(service), false)

  const deleted = moveServiceToTrash(practitionerId, service.id)
  assert.equal(isTrashed(deleted.service), true)
  assert.equal(deleted.impact.bookings, 0)
})

test('purgeExpiredTrash removes expired records and keeps records inside restore period', () => {
  cleanup()
  const expiredPatient = addPatient('P-REPO-LIFE-expired')
  const retainedPatient = addPatient('P-REPO-LIFE-retained')
  movePatientGraphToTrash(practitionerId, expiredPatient.id, { now: new Date('2026-04-01T12:00:00.000Z') })
  movePatientGraphToTrash(practitionerId, retainedPatient.id, { now: new Date('2026-05-01T12:00:00.000Z') })

  const removed = purgeExpiredTrash({ now: new Date('2026-05-04T12:00:00.000Z') })

  assert.equal(removed.patients, 1)
  assert.equal(patientsStore.some(patient => patient.id === expiredPatient.id), false)
  assert.equal(patientsStore.some(patient => patient.id === retainedPatient.id), true)
})
