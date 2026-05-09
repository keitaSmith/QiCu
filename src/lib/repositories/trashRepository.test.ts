import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import { setPatientPractitionerId } from '@/lib/practitioners'
import { buildTrashRecoveryView } from '@/lib/trashView'
import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'
import { listRecoveryView, rowsToTrashPayload } from './trashRepository'

const practitionerId = 'prac-repo-trash'
const otherPractitionerId = 'prac-repo-trash-other'

function cleanup() {
  for (let index = patientsStore.length - 1; index >= 0; index -= 1) {
    if (patientsStore[index].id.startsWith('P-REPO-TRASH')) patientsStore.splice(index, 1)
  }
  for (let index = BOOKINGS.length - 1; index >= 0; index -= 1) {
    if (BOOKINGS[index].id.startsWith('b-repo-trash')) BOOKINGS.splice(index, 1)
  }
  for (let index = sessionsStore.length - 1; index >= 0; index -= 1) {
    if (sessionsStore[index].id.startsWith('S-REPO-TRASH')) sessionsStore.splice(index, 1)
  }
  for (let index = servicesStore.length - 1; index >= 0; index -= 1) {
    if (servicesStore[index].id.startsWith('svc-repo-trash')) servicesStore.splice(index, 1)
  }
}

function trashMetadata(
  deletionGroupId: string,
  deletionType: TrashMetadata['deletionType'],
  deletedAt: string,
  restoreUntil = '2026-06-03T12:00:00.000Z',
): TrashMetadata {
  return {
    deletedAt,
    restoreUntil,
    deletedByPractitionerId: practitionerId,
    deletionGroupId,
    deletionType,
  }
}

function seedTrashData() {
  const patientGroup = trashMetadata('repo-trash-patient-group', 'patient-data', '2026-05-04T12:00:00.000Z')
  const individualBooking = trashMetadata('repo-trash-booking', 'booking', '2026-05-05T12:00:00.000Z', '2026-06-04T12:00:00.000Z')
  const individualSession = trashMetadata('repo-trash-session', 'session', '2026-05-03T12:00:00.000Z', '2026-06-02T12:00:00.000Z')
  const individualService = trashMetadata('repo-trash-service', 'service', '2026-05-06T12:00:00.000Z', '2026-06-05T12:00:00.000Z')

  const patient: FhirPatient = setPatientPractitionerId(
    {
      resourceType: 'Patient',
      id: 'P-REPO-TRASH-1',
      active: true,
      name: [{ text: 'Alice Repository Trash' }],
      trashMetadata: patientGroup,
    },
    practitionerId,
  )
  patientsStore.push(patient)

  const otherPatient = setPatientPractitionerId(
    {
      resourceType: 'Patient',
      id: 'P-REPO-TRASH-other',
      active: true,
      name: [{ text: 'Other Scope Trash' }],
      trashMetadata: trashMetadata('repo-trash-other-group', 'patient-data', '2026-05-07T12:00:00.000Z'),
    },
    otherPractitionerId,
  )
  patientsStore.push(otherPatient)

  const groupedBooking: Booking = {
    id: 'b-repo-trash-grouped',
    code: 'BKG-REPO-GROUP',
    practitionerId,
    patientId: patient.id,
    serviceId: 'svc-repo-trash-1',
    serviceName: 'Acupuncture',
    serviceDurationMinutes: 45,
    start: '2026-05-04T10:00:00.000Z',
    end: '2026-05-04T10:45:00.000Z',
    status: 'confirmed',
    trashMetadata: patientGroup,
  }
  const booking: Booking = {
    ...groupedBooking,
    id: 'b-repo-trash-individual',
    code: 'BKG-REPO-IND',
    trashMetadata: individualBooking,
  }
  BOOKINGS.push(groupedBooking, booking)

  const groupedSession: Session = {
    id: 'S-REPO-TRASH-grouped',
    practitionerId,
    patientId: patient.id,
    startDateTime: '2026-05-04T10:00:00.000Z',
    serviceName: 'Grouped session',
    chiefComplaint: 'Grouped shoulder pain',
    trashMetadata: patientGroup,
  }
  const session: Session = {
    ...groupedSession,
    id: 'S-REPO-TRASH-individual',
    serviceName: 'Individual session',
    chiefComplaint: 'Individual shoulder pain',
    trashMetadata: individualSession,
  }
  sessionsStore.push(groupedSession, session)

  const service: Service = {
    id: 'svc-repo-trash-individual',
    practitionerId,
    name: 'Massage',
    durationMinutes: 60,
    active: true,
    trashMetadata: individualService,
  }
  servicesStore.push(service)
}

afterEach(cleanup)

test('patient deletion group appears grouped and hides child records from top-level individuals', async () => {
  cleanup()
  seedTrashData()

  const view = await listRecoveryView(practitionerId)

  assert.equal(view.patientGroups.length, 1)
  assert.equal(view.patientGroups[0].label, 'Alice Repository Trash')
  assert.equal(view.patientGroups[0].bookingsCount, 1)
  assert.equal(view.patientGroups[0].sessionsCount, 1)
  assert.equal(view.individualRecords.some(item => item.label.includes('BKG-REPO-GROUP')), false)
})

test('filters, search, sort, and practitioner scoping are preserved', async () => {
  cleanup()
  seedTrashData()

  const patientGroups = await listRecoveryView(practitionerId, { type: 'patient-groups' })
  assert.equal(patientGroups.patientGroups.length, 1)
  assert.equal(patientGroups.individualRecords.length, 0)

  const search = await listRecoveryView(practitionerId, { query: 'bkg-repo-ind' })
  assert.equal(search.individualRecords.length, 1)
  assert.equal(search.individualRecords[0].recordType, 'booking')

  const sorted = await listRecoveryView(practitionerId, { sort: 'restore-asc' })
  assert.deepEqual(sorted.individualRecords.map(item => item.label), [
    'Individual session',
    'BKG-REPO-IND - Acupuncture',
    'Massage (60 min)',
  ])

  const otherScope = await listRecoveryView(otherPractitionerId)
  assert.equal(otherScope.patientGroups.length, 1)
  assert.equal(otherScope.patientGroups[0].label, 'Other Scope Trash')
  assert.equal(otherScope.individualRecords.length, 0)
})

test('DB trash row mapping preserves public ids and grouped recovery shape', async () => {
  const deletedAt = new Date('2026-05-04T12:00:00.000Z')
  const restoreUntil = new Date('2026-06-03T12:00:00.000Z')
  const practitionerDbId = '11111111-1111-4111-8111-111111111111'
  const deletionGroupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const patientDbId = '22222222-2222-4222-8222-222222222201'
  const serviceDbId = '33333333-3333-4333-8333-333333333301'
  const bookingDbId = '44444444-4444-4444-8444-444444444401'

  const payload = await rowsToTrashPayload(
    {
      patients: [{
        id: patientDbId,
        publicId: 'P-TRASH-DB-1',
        practitionerId: practitionerDbId,
        active: true,
        firstName: 'Db',
        lastName: 'Patient',
        displayName: 'Db Patient',
        birthDate: null,
        gender: null,
        phone: null,
        email: null,
        preferredLanguage: null,
        fhirJson: { resourceType: 'Patient', id: 'P-TRASH-DB-1', name: [{ text: 'Db Patient' }] },
        searchText: null,
        createdAt: deletedAt,
        updatedAt: deletedAt,
        archivedAt: null,
        deletedAt,
        restoreUntil,
        deletedByPractitionerId: practitionerDbId,
        deletionGroupId,
        deletionType: 'patient-data',
        deletionReason: null,
      }],
      bookings: [{
        id: bookingDbId,
        publicId: 'b-trash-db-1',
        code: 'BKG-TRASH-DB',
        practitionerId: practitionerDbId,
        patientId: patientDbId,
        serviceId: serviceDbId,
        serviceName: 'Acupuncture',
        serviceDurationMinutes: 45,
        resource: null,
        startAt: deletedAt,
        endAt: new Date('2026-05-04T12:45:00.000Z'),
        status: 'confirmed',
        statusUpdatedAt: null,
        notes: null,
        externalSource: null,
        externalCalendarId: null,
        externalEventId: null,
        externalSyncStatus: null,
        externalLastSyncedAt: null,
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt,
        restoreUntil,
        deletedByPractitionerId: practitionerDbId,
        deletionGroupId,
        deletionType: 'patient-data',
        deletionReason: null,
      }],
      sessions: [{
        id: '55555555-5555-4555-8555-555555555501',
        publicId: 'S-TRASH-DB-1',
        practitionerId: practitionerDbId,
        patientId: patientDbId,
        bookingId: bookingDbId,
        serviceId: serviceDbId,
        serviceName: 'Acupuncture',
        startAt: deletedAt,
        chiefComplaint: 'DB mapped complaint',
        treatmentSummary: null,
        outcome: null,
        treatmentNotes: null,
        painScore: null,
        tcmDiagnosis: null,
        tcmFindings: null,
        pointsUsed: null,
        techniques: null,
        basicVitals: null,
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt,
        restoreUntil,
        deletedByPractitionerId: practitionerDbId,
        deletionGroupId,
        deletionType: 'patient-data',
        deletionReason: null,
      }],
      services: [{
        id: serviceDbId,
        publicId: 'svc-trash-db-1',
        practitionerId: practitionerDbId,
        name: 'Massage',
        durationMinutes: 60,
        description: null,
        active: true,
        priceCents: null,
        currency: null,
        createdAt: deletedAt,
        updatedAt: deletedAt,
        archivedAt: null,
        deletedAt,
        restoreUntil,
        deletedByPractitionerId: practitionerDbId,
        deletionGroupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        deletionType: 'service',
        deletionReason: null,
      }],
    },
    {
      patients: new Map([[patientDbId, 'P-TRASH-DB-1']]),
      services: new Map([[serviceDbId, 'svc-trash-db-1']]),
      bookings: new Map([[bookingDbId, 'b-trash-db-1']]),
    },
  )
  const view = buildTrashRecoveryView(payload)

  assert.equal(payload.patients[0].id, 'P-TRASH-DB-1')
  assert.equal(payload.bookings[0].id, 'b-trash-db-1')
  assert.equal(payload.bookings[0].patientId, 'P-TRASH-DB-1')
  assert.equal(payload.bookings[0].serviceId, 'svc-trash-db-1')
  assert.equal(payload.sessions[0].id, 'S-TRASH-DB-1')
  assert.equal(payload.sessions[0].bookingId, 'b-trash-db-1')
  assert.equal(payload.services[0].id, 'svc-trash-db-1')
  assert.equal(payload.bookings.some(item => /^[0-9a-f-]{36}$/i.test(item.id)), false)
  assert.equal(payload.sessions.some(item => /^[0-9a-f-]{36}$/i.test(item.id)), false)
  assert.equal(view.patientGroups.length, 1)
  assert.equal(view.patientGroups[0].bookingsCount, 1)
  assert.equal(view.patientGroups[0].sessionsCount, 1)
  assert.equal(view.individualRecords.some(item => item.label.includes('BKG-TRASH-DB')), false)
  assert.equal(view.individualRecords.some(item => item.recordType === 'service'), true)
})
