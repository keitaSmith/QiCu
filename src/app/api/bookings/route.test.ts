import assert from 'node:assert/strict'
import test from 'node:test'

import { NextRequest } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { disconnectGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import { DELETE, PATCH } from './[bookingId]/route'
import { POST } from './route'

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

test('creates a valid booking', async () => {
  const snapshot = BOOKINGS.map(booking => ({ ...booking }))

  try {
    const start = new Date('2026-05-10T12:30:00.000Z')
    const end = new Date('2026-05-10T13:15:00.000Z')
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
    const start = '2026-05-10T12:30:00.000Z'
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
    const start = new Date('2026-05-10T12:30:00.000Z')
    const end = new Date('2026-05-10T13:15:00.000Z')
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
        start: '2026-05-10T12:30:00.000Z',
        end: '2026-05-10T13:00:00.000Z',
        skipGoogleWriteback: true,
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.id, 'b-tom-today-002')
    assert.equal(updated.start, '2026-05-10T12:30:00.000Z')
    assert.equal(updated.end, '2026-05-10T13:00:00.000Z')
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
        start: '2026-05-10T12:30:00.000Z',
        end: '2026-05-10T13:00:00.000Z',
      }),
      { params: Promise.resolve({ bookingId: 'b-tom-today-002' }) },
    )

    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.externalSyncStatus, 'error')
    assert.equal(updated.start, '2026-05-10T12:30:00.000Z')
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
    assert.equal(BOOKINGS.some(item => item.id === 'b-tom-today-002'), false)
    assert.equal(loggedErrors.length, 1)
    assert.equal(loggedErrors[0][0], 'Google Calendar booking delete sync failed')
  } finally {
    global.fetch = originalFetch
    console.error = originalConsoleError
    disconnectGoogleIntegration(practitionerId)
    restoreBookings(snapshot)
  }
})
