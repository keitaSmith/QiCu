import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import { sessionsStore } from '@/data/sessionsStore'
import type { Booking } from '@/models/booking'
import type { Session } from '@/models/session'
import { create, getById, listByPatient, listByPractitioner, update } from './sessionsRepository'

const practitionerId = 'prac-repo-session'
const otherPractitionerId = 'prac-repo-session-other'

function cleanup() {
  for (let index = sessionsStore.length - 1; index >= 0; index -= 1) {
    if (sessionsStore[index].id.startsWith('S-REPO-') || sessionsStore[index].patientId.startsWith('P-REPO-SESSION')) {
      sessionsStore.splice(index, 1)
    }
  }
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id.startsWith('b-repo-session')) BOOKINGS.splice(index, 1)
  }
}

function session(input: Partial<Session> = {}): Session {
  return {
    id: input.id ?? `S-REPO-${Math.random().toString(36).slice(2, 8)}`,
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-REPO-SESSION',
    startDateTime: input.startDateTime ?? '2026-05-10T10:00:00.000Z',
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    chiefComplaint: input.chiefComplaint ?? 'Repository test',
    bookingId: input.bookingId,
  }
}

function booking(input: Partial<Booking> = {}): Booking {
  return {
    id: input.id ?? 'b-repo-session-link',
    code: input.code ?? 'BKG-SESSION',
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-REPO-SESSION',
    serviceId: input.serviceId ?? 'svc-repo-session',
    serviceName: input.serviceName ?? 'Session Service',
    serviceDurationMinutes: input.serviceDurationMinutes ?? 45,
    start: input.start ?? '2026-05-10T10:00:00.000Z',
    end: input.end ?? '2026-05-10T10:45:00.000Z',
    status: input.status ?? 'confirmed',
    sessionId: input.sessionId,
  }
}

afterEach(cleanup)

test('listByPractitioner and listByPatient respect practitioner scope', () => {
  cleanup()
  const scoped = session({ id: 'S-REPO-scoped', patientId: 'P-REPO-SESSION-A' })
  const otherScope = session({
    id: 'S-REPO-other',
    practitionerId: otherPractitionerId,
    patientId: 'P-REPO-SESSION-A',
  })
  sessionsStore.push(scoped, otherScope)

  assert.deepEqual(listByPractitioner(practitionerId).map(item => item.id), [scoped.id])
  assert.deepEqual(listByPatient(practitionerId, 'P-REPO-SESSION-A').map(item => item.id), [scoped.id])
})

test('getById respects practitioner scope', () => {
  cleanup()
  const scoped = session({ id: 'S-REPO-get' })
  sessionsStore.push(scoped)

  assert.equal(getById(practitionerId, scoped.id)?.id, scoped.id)
  assert.equal(getById(otherPractitionerId, scoped.id), null)
})

test('create supports booking-linked and walk-in sessions', () => {
  cleanup()
  const linkedBooking = booking({ id: 'b-repo-session-linked' })
  BOOKINGS.push(linkedBooking)

  const linked = create(practitionerId, {
    patientId: linkedBooking.patientId,
    bookingId: linkedBooking.id,
    serviceId: linkedBooking.serviceId,
    serviceName: linkedBooking.serviceName,
    chiefComplaint: 'Linked session',
  })
  assert.equal(linked.bookingId, linkedBooking.id)
  assert.equal(linkedBooking.sessionId, linked.id)
  assert.equal(linkedBooking.status, 'in-progress')

  const walkIn = create(practitionerId, {
    patientId: 'P-REPO-SESSION-WALKIN',
    bookingId: null,
    chiefComplaint: 'Walk-in session',
  })
  assert.equal(walkIn.bookingId, null)
})

test('update respects practitioner scope', () => {
  cleanup()
  const existing = session({ id: 'S-REPO-update' })
  sessionsStore.push(existing)

  assert.equal(update(otherPractitionerId, existing.id, { chiefComplaint: 'Wrong scope' }), null)

  const updated = update(practitionerId, existing.id, {
    chiefComplaint: 'Updated complaint',
    bookingId: null,
  })

  assert.equal(updated?.id, existing.id)
  assert.equal(updated?.chiefComplaint, 'Updated complaint')
  assert.equal(updated?.bookingId, null)
})

