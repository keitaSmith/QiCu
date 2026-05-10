import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { NextRequest } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { sessionsStore } from '@/data/sessionsStore'
import { disableDatabaseForRouteUnitTest } from '@/test/disableDatabaseForRouteUnitTest'
import type { TrashMetadata } from '@/models/lifecycle'

// These route unit tests intentionally mutate in-memory fixtures. DB-backed route
// integration tests should use deterministic database fixtures in separate files.
let restoreDatabaseUrl: (() => void) | undefined
let POST: typeof import('./route').POST

before(async () => {
  restoreDatabaseUrl = disableDatabaseForRouteUnitTest()
  POST = (await import('./route')).POST
})

after(() => {
  restoreDatabaseUrl?.()
})

const practitionerId = 'prac-tom-cook'

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/patients/P-T-1001/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-qicu-practitioner-id': practitionerId,
    },
    body: JSON.stringify(body),
  })
}

function restorePatients(snapshot: typeof patientsStore) {
  patientsStore.splice(0, patientsStore.length, ...snapshot)
}

function restoreBookings(snapshot: typeof BOOKINGS) {
  BOOKINGS.splice(0, BOOKINGS.length, ...snapshot)
}

function restoreSessions(snapshot: typeof sessionsStore) {
  sessionsStore.splice(0, sessionsStore.length, ...snapshot)
}

test('rejects creating a session for an archived patient', async () => {
  const patientSnapshot = patientsStore.map(patient => ({ ...patient }))
  const sessionSnapshot = sessionsStore.map(session => ({ ...session }))

  try {
    const patient = patientsStore.find(item => item.id === 'P-T-1001')
    assert.ok(patient)
    patient.active = false

    const response = await POST(
      buildRequest({
        startDateTime: '2026-05-10T12:30:00.000Z',
        serviceId: 'tom-acu-45',
        chiefComplaint: 'Follow-up',
      }),
      { params: Promise.resolve({ patientId: 'P-T-1001' }) },
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(payload.error, 'Archived patients cannot be used for new sessions. Reactivate the patient first.')
  } finally {
    restorePatients(patientSnapshot)
    restoreSessions(sessionSnapshot)
  }
})

test('rejects linking a new session to a trashed booking', async () => {
  const bookingSnapshot = BOOKINGS.map(booking => ({ ...booking }))
  const sessionSnapshot = sessionsStore.map(session => ({ ...session }))
  const trashMetadata: TrashMetadata = {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: practitionerId,
    deletionGroupId: 'trash-session-link-test',
    deletionType: 'booking',
  }

  try {
    const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
    assert.ok(booking)
    booking.trashMetadata = trashMetadata

    const response = await POST(
      buildRequest({
        bookingId: booking.id,
        serviceId: booking.serviceId,
        chiefComplaint: 'Follow-up',
      }),
      { params: Promise.resolve({ patientId: booking.patientId }) },
    )

    assert.equal(response.status, 404)
    const payload = await response.json()
    assert.equal(payload.error, 'Booking not found')
  } finally {
    restoreBookings(bookingSnapshot)
    restoreSessions(sessionSnapshot)
  }
})

