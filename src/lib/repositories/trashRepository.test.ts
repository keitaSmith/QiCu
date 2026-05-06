import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { sessionsStore } from '@/data/sessionsStore'
import { setPatientPractitionerId } from '@/lib/practitioners'
import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import type { Service } from '@/models/service'
import type { Session } from '@/models/session'
import { listRecoveryView } from './trashRepository'

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

test('patient deletion group appears grouped and hides child records from top-level individuals', () => {
  cleanup()
  seedTrashData()

  const view = listRecoveryView(practitionerId)

  assert.equal(view.patientGroups.length, 1)
  assert.equal(view.patientGroups[0].label, 'Alice Repository Trash')
  assert.equal(view.patientGroups[0].bookingsCount, 1)
  assert.equal(view.patientGroups[0].sessionsCount, 1)
  assert.equal(view.individualRecords.some(item => item.label.includes('BKG-REPO-GROUP')), false)
})

test('filters, search, sort, and practitioner scoping are preserved', () => {
  cleanup()
  seedTrashData()

  const patientGroups = listRecoveryView(practitionerId, { type: 'patient-groups' })
  assert.equal(patientGroups.patientGroups.length, 1)
  assert.equal(patientGroups.individualRecords.length, 0)

  const search = listRecoveryView(practitionerId, { query: 'bkg-repo-ind' })
  assert.equal(search.individualRecords.length, 1)
  assert.equal(search.individualRecords[0].recordType, 'booking')

  const sorted = listRecoveryView(practitionerId, { sort: 'restore-asc' })
  assert.deepEqual(sorted.individualRecords.map(item => item.label), [
    'Individual session',
    'BKG-REPO-IND - Acupuncture',
    'Massage (60 min)',
  ])

  const otherScope = listRecoveryView(otherPractitionerId)
  assert.equal(otherScope.patientGroups.length, 1)
  assert.equal(otherScope.patientGroups[0].label, 'Other Scope Trash')
  assert.equal(otherScope.individualRecords.length, 0)
})

