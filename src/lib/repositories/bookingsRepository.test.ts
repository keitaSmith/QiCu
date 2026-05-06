import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import {
  createWithOverlapCheck,
  findAvailabilityBlockingBookings,
  getById,
  listByPatient,
  listGoogleImportPreviewBookings,
  listGoogleLinkedBookingsForReconcile,
  listByPractitioner,
  reconcileGoogleLinkedBooking,
  updateWithOverlapCheck,
} from './bookingsRepository'

const practitionerId = 'prac-repo-booking'
const otherPractitionerId = 'prac-repo-booking-other'

function cleanup() {
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id.startsWith('b-repo-')) BOOKINGS.splice(index, 1)
  }
}

function trashMetadata(): TrashMetadata {
  return {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: practitionerId,
    deletionGroupId: 'trash-repo-booking',
    deletionType: 'booking',
  }
}

function booking(input: Partial<Booking> = {}): Booking {
  return {
    id: input.id ?? `b-repo-${Math.random().toString(36).slice(2, 8)}`,
    code: input.code ?? 'BKG-REPO',
    practitionerId: input.practitionerId ?? practitionerId,
    patientId: input.patientId ?? 'P-REPO-BOOKING',
    serviceId: input.serviceId ?? 'svc-repo-booking',
    serviceName: input.serviceName ?? 'Repository Service',
    serviceDurationMinutes: input.serviceDurationMinutes ?? 45,
    start: input.start ?? '2026-05-10T10:00:00.000Z',
    end: input.end ?? '2026-05-10T10:45:00.000Z',
    status: input.status ?? 'confirmed',
    trashMetadata: input.trashMetadata,
    externalSource: input.externalSource,
    externalCalendarId: input.externalCalendarId,
    externalEventId: input.externalEventId,
    externalSyncStatus: input.externalSyncStatus,
    externalLastSyncedAt: input.externalLastSyncedAt,
  }
}

afterEach(cleanup)

test('listByPractitioner and listByPatient respect practitioner scope', () => {
  cleanup()
  const scoped = booking({ id: 'b-repo-scoped', patientId: 'P-A' })
  const samePatientOtherScope = booking({
    id: 'b-repo-other-scope',
    practitionerId: otherPractitionerId,
    patientId: 'P-A',
  })
  BOOKINGS.push(scoped, samePatientOtherScope)

  assert.deepEqual(listByPractitioner(practitionerId).map(item => item.id), [scoped.id])
  assert.deepEqual(listByPatient(practitionerId, 'P-A').map(item => item.id), [scoped.id])
})

test('getById respects practitioner scope and trash state', () => {
  cleanup()
  const scoped = booking({ id: 'b-repo-get' })
  const trashed = booking({ id: 'b-repo-trashed', trashMetadata: trashMetadata() })
  BOOKINGS.push(scoped, trashed)

  assert.equal(getById(practitionerId, scoped.id)?.id, scoped.id)
  assert.equal(getById(otherPractitionerId, scoped.id), null)
  assert.equal(getById(practitionerId, trashed.id), null)
})

test('confirmed and pending bookings block availability while other states do not', () => {
  cleanup()
  for (const status of ['confirmed', 'pending', 'cancelled', 'no-show', 'completed'] as const) {
    BOOKINGS.push(booking({ id: `b-repo-${status}`, status }))
  }
  BOOKINGS.push(booking({ id: 'b-repo-trash-block', status: 'confirmed', trashMetadata: trashMetadata() }))

  assert.deepEqual(
    findAvailabilityBlockingBookings(practitionerId).map(item => item.id).sort(),
    ['b-repo-confirmed', 'b-repo-pending'],
  )
})

test('create and update preserve overlap behavior', () => {
  cleanup()
  BOOKINGS.push(booking({ id: 'b-repo-existing' }))

  const overlappingCreate = createWithOverlapCheck(practitionerId, {
    code: 'BKG-OVERLAP',
    patientId: 'P-REPO-BOOKING',
    serviceId: 'svc-repo-booking',
    serviceName: 'Repository Service',
    serviceDurationMinutes: 45,
    start: '2026-05-10T10:15:00.000Z',
    end: '2026-05-10T11:00:00.000Z',
  })
  assert.equal('error' in overlappingCreate && overlappingCreate.error, 'overlap')

  const created = createWithOverlapCheck(practitionerId, {
    id: 'b-repo-created',
    code: 'BKG-CREATED',
    patientId: 'P-REPO-BOOKING',
    serviceId: 'svc-repo-booking',
    serviceName: 'Repository Service',
    serviceDurationMinutes: 45,
    start: '2026-05-10T11:00:00.000Z',
    end: '2026-05-10T11:45:00.000Z',
  })
  if (!('booking' in created) || !created.booking) {
    throw new Error('Expected booking to be created')
  }
  assert.equal(created.booking.id, 'b-repo-created')

  const overlappingUpdate = updateWithOverlapCheck(practitionerId, 'b-repo-created', {
    start: '2026-05-10T10:15:00.000Z',
    end: '2026-05-10T11:00:00.000Z',
  })
  assert.equal('error' in overlappingUpdate && overlappingUpdate.error, 'overlap')
})

test('cancelled booking reschedule is rejected unless reactivated', () => {
  cleanup()
  BOOKINGS.push(booking({ id: 'b-repo-cancelled', status: 'cancelled' }))

  const rejected = updateWithOverlapCheck(practitionerId, 'b-repo-cancelled', {
    start: '2026-05-10T11:00:00.000Z',
    end: '2026-05-10T11:45:00.000Z',
  })
  assert.equal('error' in rejected && rejected.error, 'cancelled-reschedule')

  const updated = updateWithOverlapCheck(practitionerId, 'b-repo-cancelled', {
    start: '2026-05-10T11:00:00.000Z',
    end: '2026-05-10T11:45:00.000Z',
    status: 'confirmed',
  })
  if (!('booking' in updated) || !updated.booking) {
    throw new Error('Expected booking to be updated')
  }
  assert.equal(updated.booking.status, 'confirmed')
})

test('Google import preview and reconcile helpers preserve scoped in-memory behavior', () => {
  cleanup()
  const linked = booking({
    id: 'b-repo-google-linked',
    externalSource: 'google',
    externalCalendarId: 'calendar-repo',
    externalEventId: 'event-repo',
  })
  const trashed = booking({
    id: 'b-repo-google-trashed',
    trashMetadata: trashMetadata(),
    externalSource: 'google',
    externalCalendarId: 'calendar-repo',
    externalEventId: 'event-trash',
  })
  const other = booking({
    id: 'b-repo-google-other',
    practitionerId: otherPractitionerId,
    externalSource: 'google',
    externalCalendarId: 'calendar-repo',
    externalEventId: 'event-other',
  })
  BOOKINGS.push(linked, trashed, other)

  assert.deepEqual(
    listGoogleImportPreviewBookings(practitionerId).map(item => item.id).sort(),
    [linked.id, trashed.id].sort(),
  )
  assert.deepEqual(
    listGoogleLinkedBookingsForReconcile(practitionerId).map(item => item.id).sort(),
    [linked.id, trashed.id].sort(),
  )

  const result = reconcileGoogleLinkedBooking(
    practitionerId,
    linked.id,
    {
      id: 'event-repo',
      start: { dateTime: '2026-05-10T11:00:00.000Z' },
      end: { dateTime: '2026-05-10T11:45:00.000Z' },
      location: 'Room 2',
    },
    { now: new Date('2026-05-06T12:00:00.000Z') },
  )

  assert.equal(result, 'updated')
  assert.equal(linked.start, '2026-05-10T11:00:00.000Z')
  assert.equal(linked.resource, 'Room 2')
  assert.equal(linked.externalSyncStatus, 'synced')
  assert.equal(linked.externalLastSyncedAt, '2026-05-06T12:00:00.000Z')
})
