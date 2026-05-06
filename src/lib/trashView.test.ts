import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildTrashRecoveryView,
  filterTrashView,
  sortTrashView,
  trashSortOptions,
  type TrashPayload,
  type TrashSortOption,
  type TrashTypeFilter,
} from '@/lib/trashView'
import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'

function trashMetadata(
  deletionGroupId: string,
  deletionType: TrashMetadata['deletionType'],
  deletedAt: string,
  restoreUntil = '2026-06-03T12:00:00.000Z',
): TrashMetadata {
  return {
    deletedAt,
    restoreUntil,
    deletedByPractitionerId: 'prac-trash-view',
    deletionGroupId,
    deletionType,
  }
}

function patient(id: string, name: string, metadata: TrashMetadata): FhirPatient {
  return {
    resourceType: 'Patient',
    id,
    active: true,
    name: [{ text: name }],
    trashMetadata: metadata,
  }
}

function booking(id: string, code: string, metadata: TrashMetadata): Booking {
  return {
    id,
    code,
    practitionerId: 'prac-trash-view',
    patientId: 'P-1',
    serviceId: 'svc-1',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    start: '2026-05-04T10:00:00.000Z',
    end: '2026-05-04T10:45:00.000Z',
    status: 'confirmed',
    trashMetadata: metadata,
  }
}

function session(id: string, metadata: TrashMetadata): Session {
  return {
    id,
    practitionerId: 'prac-trash-view',
    patientId: 'P-1',
    startDateTime: '2026-05-04T10:00:00.000Z',
    serviceName: 'Follow-up session',
    chiefComplaint: 'Shoulder pain',
    trashMetadata: metadata,
  }
}

function service(id: string, metadata: TrashMetadata): Service {
  return {
    id,
    practitionerId: 'prac-trash-view',
    name: 'Massage',
    durationMinutes: 60,
    active: true,
    trashMetadata: metadata,
  }
}

function trashPayload(): TrashPayload {
  const patientGroup = trashMetadata('group-patient-data', 'patient-data', '2026-05-04T12:00:00.000Z')
  const individualBooking = trashMetadata('group-booking', 'booking', '2026-05-05T12:00:00.000Z', '2026-06-04T12:00:00.000Z')
  const individualSession = trashMetadata('group-session', 'session', '2026-05-03T12:00:00.000Z', '2026-06-02T12:00:00.000Z')
  const individualService = trashMetadata('group-service', 'service', '2026-05-06T12:00:00.000Z', '2026-06-05T12:00:00.000Z')

  return {
    patients: [patient('P-1', 'Alice Muller', patientGroup)],
    bookings: [
      booking('B-1', 'BKG-GROUP-1', patientGroup),
      booking('B-2', 'BKG-IND-1', individualBooking),
    ],
    sessions: [
      session('S-1', patientGroup),
      session('S-2', individualSession),
    ],
    services: [service('SV-1', individualService)],
  }
}

test('patient deletion group appears as one grouped item with child counts', () => {
  const view = buildTrashRecoveryView(trashPayload())

  assert.equal(view.patientGroups.length, 1)
  assert.equal(view.patientGroups[0].label, 'Alice Muller')
  assert.equal(view.patientGroups[0].bookingsCount, 1)
  assert.equal(view.patientGroups[0].sessionsCount, 1)
})

test('patient data group children are not top-level individual records', () => {
  const view = buildTrashRecoveryView(trashPayload())

  assert.equal(view.individualRecords.some(item => item.label.includes('BKG-GROUP-1')), false)
  assert.equal(view.individualRecords.some(item => item.recordType === 'session' && item.deletionGroupId === 'group-patient-data'), false)
  assert.equal(view.individualRecords.some(item => item.label.includes('BKG-IND-1')), true)
})

test('type filters keep patient groups separate from individual records', () => {
  const view = buildTrashRecoveryView(trashPayload())

  const byType = (type: TrashTypeFilter) => filterTrashView(view, { query: '', type })

  assert.equal(byType('all').patientGroups.length, 1)
  assert.equal(byType('all').individualRecords.length, 3)
  assert.equal(byType('patient-groups').patientGroups.length, 1)
  assert.equal(byType('patient-groups').individualRecords.length, 0)
  assert.deepEqual(byType('bookings').individualRecords.map(item => item.recordType), ['booking'])
  assert.deepEqual(byType('sessions').individualRecords.map(item => item.recordType), ['session'])
  assert.deepEqual(byType('services').individualRecords.map(item => item.recordType), ['service'])
})

test('search filters groups by patient name and individuals by record text', () => {
  const view = buildTrashRecoveryView(trashPayload())

  const patientResult = filterTrashView(view, { query: 'alice', type: 'all' })
  assert.equal(patientResult.patientGroups.length, 1)
  assert.equal(patientResult.individualRecords.length, 0)

  const bookingResult = filterTrashView(view, { query: 'bkg-ind', type: 'all' })
  assert.equal(bookingResult.patientGroups.length, 0)
  assert.equal(bookingResult.individualRecords.length, 1)
  assert.equal(bookingResult.individualRecords[0].recordType, 'booking')

  const sessionResult = filterTrashView(view, { query: 'shoulder', type: 'sessions' })
  assert.equal(sessionResult.individualRecords.length, 1)
})

test('sort options order each section by deletedAt and restoreUntil', () => {
  const view = buildTrashRecoveryView(trashPayload())

  const labelsBySort = (sort: TrashSortOption) =>
    sortTrashView(view, sort).individualRecords.map(item => item.label)

  assert.deepEqual(labelsBySort('deleted-desc'), ['Massage (60 min)', 'BKG-IND-1 - Acupuncture', 'Follow-up session'])
  assert.deepEqual(labelsBySort('deleted-asc'), ['Follow-up session', 'BKG-IND-1 - Acupuncture', 'Massage (60 min)'])
  assert.deepEqual(labelsBySort('restore-asc'), ['Follow-up session', 'BKG-IND-1 - Acupuncture', 'Massage (60 min)'])
  assert.deepEqual(labelsBySort('restore-desc'), ['Massage (60 min)', 'BKG-IND-1 - Acupuncture', 'Follow-up session'])
})

test('trash sort option labels use clear expiration wording', () => {
  assert.deepEqual(trashSortOptions.map(option => option.label), [
    'Newest deleted first',
    'Oldest deleted first',
    'Expiring soonest',
    'Expiring latest',
  ])
  assert.equal(trashSortOptions.some(option => option.label.toLowerCase().includes('restore window')), false)
})
