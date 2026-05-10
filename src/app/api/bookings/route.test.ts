import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { NextRequest } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { isTrashed } from '@/lib/dataLifecycle'
import { disconnectGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import { disableDatabaseForRouteUnitTest } from '@/test/disableDatabaseForRouteUnitTest'
import type { Booking } from '@/models/booking'
import type { TrashMetadata } from '@/models/lifecycle'

// These route unit tests intentionally mutate in-memory fixtures. DB-backed route
// integration tests should use deterministic database fixtures in separate files.
let restoreDatabaseUrl: (() => void) | undefined
let DELETE: typeof import('./[bookingId]/route').DELETE
let PATCH: typeof import('./[bookingId]/route').PATCH
let POST: typeof import('./route').POST
let POST_PATIENT_BOOKING: typeof import('../patients/[patientId]/bookings/route').POST

before(async () => {
  restoreDatabaseUrl = disableDatabaseForRouteUnitTest()
  const [bookingDetailRoute, bookingsRoute, patientBookingsRoute] = await Promise.all([
    import('./[bookingId]/route'),
    import('./route'),
    import('../patients/[patientId]/bookings/route'),
  ])
  DELETE = bookingDetailRoute.DELETE
  PATCH = bookingDetailRoute.PATCH
  POST = bookingsRoute.POST
  POST_PATIENT_BOOKING = patientBookingsRoute.POST
})

after(() => {
  restoreDatabaseUrl?.()
})

const practitionerId = 'prac-tom-cook'

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-qicu-practitioner-id': practitionerId,
    },
    body: JSON.stringify(body),
  })
}

function restoreBookings(snapshot: typeof BOOKINGS) {
  BOOKINGS.splice(0, BOOKINGS.length, ...snapshot)
}

function restorePatients(snapshot: typeof patientsStore) {
  patientsStore.splice(0, patientsStore.length, ...snapshot)
}

function restoreServices(snapshot: typeof servicesStore) {
  servicesStore.splice(0, servicesStore.length, ...snapshot)
}

function buildPatchRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/bookings/b-tom-today-002', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-qicu-practitioner-id': practitionerId,
    },
    body: JSON.stringify(body),
  })
}

function buildDeleteRequest() {
  return new NextRequest('http://localhost:3000/api/bookings/b-tom-today-002', {
    method: 'DELETE',
    headers: {
      'x-qicu-practitioner-id': practitionerId,
    },
  })
}

function addOverlappingBooking(status: Booking['status'], overrides: Partial<Booking> = {}) {
  const booking: Booking = {
    id: overrides.id ?? `b-test-overlap-${status}`,
    practitionerId: overrides.practitionerId ?? practitionerId,
    code: overrides.code ?? `BKG-TEST-${status.toUpperCase()}`,
    patientId: overrides.patientId ?? 'P-T-1001',
    serviceId: overrides.serviceId ?? 'tom-acu-45',
    serviceName: overrides.serviceName ?? 'Acupuncture',
    serviceDurationMinutes: overrides.serviceDurationMinutes ?? 45,
    start: overrides.start ?? '2026-06-10T12:30:00.000Z',
    end: overrides.end ?? '2026-06-10T13:15:00.000Z',
    status,
    resource: overrides.resource,
    notes: overrides.notes,
    trashMetadata: overrides.trashMetadata,
  }
  BOOKINGS.push(booking)
  return booking
}

test('creates a valid booking', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const start = new Date('2026-06-10T12:30:00.000Z')
    const end = new Date('2026-06-10T13:15:00.000Z')
    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start: start.toISOString(),
        end: end.toISOString(),
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 201)

    const created = await response.json()
    assert.equal(created.patientId, 'P-T-1001')
    assert.equal(created.serviceId, 'tom-acu-45')
    assert.equal(created.serviceDurationMinutes, 45)
    assert.equal(created.start, start.toISOString())
    assert.equal(created.end, end.toISOString())
    assert.equal(BOOKINGS[0].id, created.id)
  } finally {
    restoreBookings(snapshot)
  }
})

test('rejects overlapping bookings for the same practitioner', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const existing = BOOKINGS.find(booking => booking.id === 'b-tom-today-001')
    assert.ok(existing)

    const response = await POST(
      buildRequest({
        patientId: 'P-T-1002',
        serviceId: 'tom-acu-30',
        start: existing.start,
        end: existing.end,
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 409)
    const payload = await response.json()
    assert.equal(payload.error, 'Booking overlaps an existing booking')
  } finally {
    restoreBookings(snapshot)
  }
})

test('rejects invalid booking durations', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const start = '2026-06-10T12:30:00.000Z'
    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start,
        end: start,
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(payload.error, 'end must be after start')
  } finally {
    restoreBookings(snapshot)
  }
})

test('rejects creating a booking for an archived patient', async () => {
  const bookingSnapshot = BOOKINGS.map(booking => ({ ...booking }))
  const patientSnapshot = patientsStore.map(patient => ({ ...patient }))

  try {
    const patient = patientsStore.find(item => item.id === 'P-T-1001')
    assert.ok(patient)
    patient.active = false

    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:15:00.000Z',
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(payload.error, 'Archived patients cannot be used for new bookings. Reactivate the patient first.')
  } finally {
    restoreBookings(bookingSnapshot)
    restorePatients(patientSnapshot)
  }
})

test('rejects creating a patient-scoped booking for an archived patient', async () => {
  const bookingSnapshot = BOOKINGS.map(booking => ({ ...booking }))
  const patientSnapshot = patientsStore.map(patient => ({ ...patient }))

  try {
    const patient = patientsStore.find(item => item.id === 'P-T-1001')
    assert.ok(patient)
    patient.active = false

    const response = await POST_PATIENT_BOOKING(
      buildRequest({
        serviceId: 'tom-acu-45',
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:15:00.000Z',
      }),
      { params: Promise.resolve({ patientId: 'P-T-1001' }) },
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(payload.error, 'Archived patients cannot be used for new bookings. Reactivate the patient first.')
  } finally {
    restoreBookings(bookingSnapshot)
    restorePatients(patientSnapshot)
  }
})

test('rejects creating a booking with a disabled service', async () => {
  const bookingSnapshot = BOOKINGS.map(booking => ({ ...booking }))
  const serviceSnapshot = servicesStore.map(service => ({ ...service }))

  try {
    const service = servicesStore.find(item => item.id === 'tom-acu-45')
    assert.ok(service)
    service.active = false

    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:15:00.000Z',
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(payload.error, 'Disabled services cannot be used for new bookings. Enable the service first.')
  } finally {
    restoreBookings(bookingSnapshot)
    restoreServices(serviceSnapshot)
  }
})

test('still creates a booking when Google Calendar sync fails', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))
  const originalFetch = global.fetch
  const originalConsoleError = console.error
  const loggedErrors: unknown[][] = []

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'invalid-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () =>
    new Response('invalid_grant', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })) as typeof fetch
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }

  try {
    const start = new Date('2026-06-10T12:30:00.000Z')
    const end = new Date('2026-06-10T13:15:00.000Z')
    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    )

    assert.equal(response.status, 201)

    const created = await response.json()
    assert.equal(created.externalSyncStatus, 'error')
    assert.equal(created.externalEventId, null)
    assert.equal(BOOKINGS[0].id, created.id)
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0][0], 'Google Calendar booking create sync failed')
  } finally {
    global.fetch = originalFetch
    console.error = originalConsoleError
    disconnectGoogleIntegration(practitionerId)
    restoreBookings(snapshot)
  }
})

test('rejects overlapping booking updates for the same practitioner', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const existing = BOOKINGS.find(booking => booking.id === 'b-tom-today-001')
    assert.ok(existing)

    const response = await PATCH(
      buildPatchRequest({
        start: existing.start,
        end: existing.end,
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 409)
    const payload = await response.json()
    assert.equal(payload.error, 'Booking overlaps an existing booking')
  } finally {
    restoreBookings(snapshot)
  }
})

test('updates a booking when the new time does not overlap', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const response = await PATCH(
      buildPatchRequest({
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:00:00.000Z',
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.id, 'b-tom-today-002')
    assert.equal(updated.start, '2026-06-10T12:30:00.000Z')
    assert.equal(updated.end, '2026-06-10T13:00:00.000Z')
  } finally {
    restoreBookings(snapshot)
  }
})

test('cancelled, no-show, and completed bookings do not block creating the same time', async () => {
  for (const status of ['cancelled', 'no-show', 'completed'] as const) {
    const snapshot = BOOKINGS.map(booking => ({ ...booking }))

    try {
      addOverlappingBooking(status, { id: `b-test-create-${status}` })

      const response = await POST(
        buildRequest({
          patientId: 'P-T-1001',
          serviceId: 'tom-acu-45',
          start: '2026-06-10T12:30:00.000Z',
          end: '2026-06-10T13:15:00.000Z',
          skipGoogleWriteback: true,
        }),
      )

      assert.equal(response.status, 201)
    } finally {
      restoreBookings(snapshot)
    }
  }
})

test('confirmed and pending bookings still block creating the same time', async () => {
  for (const status of ['confirmed', 'pending'] as const) {
    const snapshot = BOOKINGS.map(booking => ({ ...booking }))

    try {
      addOverlappingBooking(status, { id: `b-test-create-${status}` })

      const response = await POST(
        buildRequest({
          patientId: 'P-T-1001',
          serviceId: 'tom-acu-45',
          start: '2026-06-10T12:30:00.000Z',
          end: '2026-06-10T13:15:00.000Z',
          skipGoogleWriteback: true,
        }),
      )

      assert.equal(response.status, 409)
      const payload = await response.json()
      assert.equal(payload.error, 'Booking overlaps an existing booking')
    } finally {
      restoreBookings(snapshot)
    }
  }
})

test('trashed bookings do not block creating the same time', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))
  const trashMetadata: TrashMetadata = {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: practitionerId,
    deletionGroupId: 'trash-overlap-create',
    deletionType: 'booking',
  }

  try {
    addOverlappingBooking('confirmed', {
      id: 'b-test-create-trashed',
      trashMetadata,
    })

    const response = await POST(
      buildRequest({
        patientId: 'P-T-1001',
        serviceId: 'tom-acu-45',
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:15:00.000Z',
        skipGoogleWriteback: true,
      }),
    )

    assert.equal(response.status, 201)
  } finally {
    restoreBookings(snapshot)
  }
})

test('cancelled booking does not block updating another booking to the same time', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    addOverlappingBooking('cancelled', { id: 'b-test-update-cancelled' })

    const response = await PATCH(
      buildPatchRequest({
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:15:00.000Z',
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.start, '2026-06-10T12:30:00.000Z')
    assert.equal(updated.end, '2026-06-10T13:15:00.000Z')
  } finally {
    restoreBookings(snapshot)
  }
})

test('rejects rescheduling a cancelled booking without triggering Google sync', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))
  const originalFetch = global.fetch
  let fetchCalls = 0

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'valid-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalls += 1
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
    assert.ok(booking)
    booking.status = 'cancelled'
    booking.externalEventId = 'event-123'
    booking.externalCalendarId = 'calendar-primary'
    const originalStart = booking.start
    const originalEnd = booking.end

    const response = await PATCH(
      buildPatchRequest({
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:00:00.000Z',
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.equal(
      payload.error,
      'Cancelled bookings cannot be rescheduled. Create a new booking or change the status first.',
    )
    assert.equal(booking.start, originalStart)
    assert.equal(booking.end, originalEnd)
    assert.equal(booking.status, 'cancelled')
    assert.equal(fetchCalls, 0)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
    restoreBookings(snapshot)
  }
})

test('allows safe non-time updates on a cancelled booking', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
    assert.ok(booking)
    booking.status = 'cancelled'

    const response = await PATCH(
      buildPatchRequest({
        notes: 'Updated cancellation note',
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.status, 'cancelled')
    assert.equal(updated.notes, 'Updated cancellation note')
    assert.equal(updated.start, booking.start)
    assert.equal(updated.end, booking.end)
  } finally {
    restoreBookings(snapshot)
  }
})

test('allows rescheduling a cancelled booking when it is explicitly reactivated', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
    assert.ok(booking)
    booking.status = 'cancelled'

    const response = await PATCH(
      buildPatchRequest({
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:00:00.000Z',
        status: 'confirmed',
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.status, 'confirmed')
    assert.equal(updated.start, '2026-06-10T12:30:00.000Z')
    assert.equal(updated.end, '2026-06-10T13:00:00.000Z')
  } finally {
    restoreBookings(snapshot)
  }
})

test('still updates a booking when Google Calendar update sync fails', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))
  const originalFetch = global.fetch
  const originalConsoleError = console.error
  const loggedErrors: unknown[][] = []

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'invalid-token',
    selectedCalendarId: 'calendar-primary',
  })

  const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
  assert.ok(booking)
  booking.externalEventId = 'event-123'
  booking.externalCalendarId = 'calendar-primary'

  global.fetch = (async () =>
    new Response('invalid_grant', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })) as typeof fetch
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }

  try {
    const response = await PATCH(
      buildPatchRequest({
        start: '2026-06-10T12:30:00.000Z',
        end: '2026-06-10T13:00:00.000Z',
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.externalSyncStatus, 'error')
    assert.equal(updated.start, '2026-06-10T12:30:00.000Z')
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0][0], 'Google Calendar booking update sync failed')
  } finally {
    global.fetch = originalFetch
    console.error = originalConsoleError
    disconnectGoogleIntegration(practitionerId)
    restoreBookings(snapshot)
  }
})

test('still deletes a booking when Google Calendar delete sync fails', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))
  const originalFetch = global.fetch
  const originalConsoleError = console.error
  const loggedErrors: unknown[][] = []

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'invalid-token',
    selectedCalendarId: 'calendar-primary',
  })

  const booking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
  assert.ok(booking)
  booking.externalEventId = 'event-123'
  booking.externalCalendarId = 'calendar-primary'

  global.fetch = (async () =>
    new Response('invalid_grant', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' },
    })) as typeof fetch
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }

  try {
    const response = await DELETE(
      buildDeleteRequest(),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const trashedBooking = BOOKINGS.find(item => item.id === 'b-tom-today-002')
    assert.ok(trashedBooking)
    assert.equal(isTrashed(trashedBooking), true)
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0][0], 'Google Calendar booking delete sync failed')
  } finally {
    global.fetch = originalFetch
    console.error = originalConsoleError
    disconnectGoogleIntegration(practitionerId)
    restoreBookings(snapshot)
  }
})
