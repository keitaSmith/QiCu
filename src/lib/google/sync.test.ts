import assert from 'node:assert/strict'
import test from 'node:test'

import { NextRequest } from 'next/server'

import { patientsStore } from '@/data/patientsStore'
import { disconnectGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import type { Booking } from '@/models/booking'
import { displayName } from '@/models/patient'
import {
  buildGoogleEventPayload,
  syncGoogleOnBookingCreate,
  syncGoogleOnBookingDelete,
  syncGoogleOnBookingUpdate,
} from './sync'

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: overrides.id ?? 'booking-123',
    code: overrides.code ?? 'BKG-TOM-123',
    practitionerId: overrides.practitionerId ?? 'prac-tom-cook',
    patientId: overrides.patientId ?? 'P-T-1001',
    serviceId: overrides.serviceId ?? 'tom-acu-60',
    serviceName: overrides.serviceName ?? 'Acupuncture',
    serviceDurationMinutes: overrides.serviceDurationMinutes ?? 60,
    start: overrides.start ?? '2026-05-12T09:00:00.000Z',
    end: overrides.end ?? '2026-05-12T10:00:00.000Z',
    status: overrides.status ?? 'confirmed',
    resource: overrides.resource ?? 'Room 1',
    notes: overrides.notes,
    externalSource: overrides.externalSource ?? null,
    externalCalendarId: overrides.externalCalendarId ?? null,
    externalEventId: overrides.externalEventId ?? null,
    externalSyncStatus: overrides.externalSyncStatus ?? null,
  }
}

test('buildGoogleEventPayload creates the expected summary, datetimes, and metadata', () => {
  const booking = buildBooking()
  const patient = patientsStore.find(item => item.id === booking.patientId)
  assert.ok(patient)

  const payload = buildGoogleEventPayload(booking)

  assert.equal(payload.summary, `${displayName(patient)} - Acupuncture`)
  assert.equal(payload.start.dateTime, booking.start)
  assert.equal(payload.end.dateTime, booking.end)
  assert.match(payload.description ?? '', /QiCu Booking ID: booking-123/)
  assert.match(payload.description ?? '', /Patient ID: P-T-1001/)
  assert.equal(payload.extendedProperties?.private?.qicuBookingId, booking.id)
  assert.equal(payload.extendedProperties?.private?.qicuServiceId, booking.serviceId)
})

test('syncGoogleOnBookingCreate creates a Google event and saves external ids', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking()
  const req = new NextRequest('http://localhost:3000/api/bookings', { method: 'POST' })
  const originalFetch = global.fetch
  const patient = patientsStore.find(item => item.id === booking.patientId)
  assert.ok(patient)

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  let capturedUrl = ''
  let capturedBody: Record<string, unknown> | null = null

  global.fetch = (async (input, init) => {
    capturedUrl = String(input)
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

    return new Response(JSON.stringify({ id: 'event-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingCreate(booking, req)
    if (!capturedBody) {
      throw new Error('Expected Google Calendar create payload to be captured')
    }
    const body = capturedBody as Record<string, unknown>

    assert.match(capturedUrl, /calendar-primary\/events$/)
    assert.equal(body.summary, `${displayName(patient)} - Acupuncture`)
    assert.equal((body.start as { dateTime?: string }).dateTime, booking.start)
    assert.equal((body.end as { dateTime?: string }).dateTime, booking.end)
    assert.equal(booking.externalSource, null)
    assert.equal(booking.externalCalendarId, 'calendar-primary')
    assert.equal(booking.externalEventId, 'event-123')
    assert.equal(booking.externalSyncStatus, 'synced')
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingCreate skips duplicate creation when externalEventId already exists', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({ externalEventId: 'existing-event-1' })
  const req = new NextRequest('http://localhost:3000/api/bookings', { method: 'POST' })
  const originalFetch = global.fetch
  let fetchCalled = false

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called for duplicate creates')
  }) as typeof fetch

  try {
    const result = await syncGoogleOnBookingCreate(booking, req)

    assert.equal(result.externalEventId, 'existing-event-1')
    assert.equal(fetchCalled, false)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingCreate skips create when booking already came from an external source', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    externalSource: 'google',
    externalCalendarId: 'calendar-imported',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings', { method: 'POST' })
  const originalFetch = global.fetch
  let fetchCalled = false

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called for externally sourced bookings')
  }) as typeof fetch

  try {
    const result = await syncGoogleOnBookingCreate(booking, req)

    assert.equal(result.externalSource, 'google')
    assert.equal(result.externalCalendarId, 'calendar-imported')
    assert.equal(fetchCalled, false)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingCreate skips create when skip option is true', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking()
  const req = new NextRequest('http://localhost:3000/api/bookings', { method: 'POST' })
  const originalFetch = global.fetch
  let fetchCalled = false

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called when Google writeback is skipped')
  }) as typeof fetch

  try {
    await syncGoogleOnBookingCreate(booking, req, { skip: true })
    assert.equal(fetchCalled, false)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate skips when booking originated from Google import', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    externalSource: 'google',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  let fetchCalled = false

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called for Google-imported bookings')
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)
    assert.equal(fetchCalled, false)
    assert.equal(booking.externalSource, 'google')
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate sends updated time and service to Google', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    serviceName: 'Massage',
    start: '2026-05-12T11:00:00.000Z',
    end: '2026-05-12T12:00:00.000Z',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  const patient = patientsStore.find(item => item.id === booking.patientId)
  assert.ok(patient)
  let capturedUrl = ''
  let capturedBody: Record<string, unknown> | null = null

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async (input, init) => {
    capturedUrl = String(input)
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

    return new Response(JSON.stringify({ id: 'event-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)
    if (!capturedBody) {
      throw new Error('Expected Google Calendar update payload to be captured')
    }
    const body = capturedBody as Record<string, unknown>

    assert.match(capturedUrl, /calendar-primary\/events\/event-123$/)
    assert.equal(body.summary, `${displayName(patient)} - Massage`)
    assert.equal((body.start as { dateTime?: string }).dateTime, booking.start)
    assert.equal((body.end as { dateTime?: string }).dateTime, booking.end)
    assert.equal(booking.externalSyncStatus, 'synced')
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate appends no-show to the summary', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    status: 'no-show',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  const patient = patientsStore.find(item => item.id === booking.patientId)
  assert.ok(patient)
  let capturedBody: Record<string, unknown> | null = null

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

    return new Response(JSON.stringify({ id: 'event-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)
    if (!capturedBody) {
      throw new Error('Expected Google Calendar no-show payload to be captured')
    }
    const body = capturedBody as Record<string, unknown>

    assert.equal(body.summary, `${displayName(patient)} - Acupuncture (No-show)`)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate keeps completed status in the description', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    status: 'completed',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  let capturedBody: Record<string, unknown> | null = null

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

    return new Response(JSON.stringify({ id: 'event-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)
    if (!capturedBody) {
      throw new Error('Expected Google Calendar completed payload to be captured')
    }
    const body = capturedBody as Record<string, unknown>

    assert.match(String(body.description ?? ''), /Status: completed/)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate deletes the event when a booking is cancelled', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    status: 'cancelled',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  let capturedMethod = ''
  let capturedUrl = ''

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async (input, init) => {
    capturedUrl = String(input)
    capturedMethod = String(init?.method ?? 'GET')

    return new Response(null, { status: 204 })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)

    assert.equal(capturedMethod, 'DELETE')
    assert.match(capturedUrl, /calendar-primary\/events\/event-123$/)
    assert.equal(booking.externalSyncStatus, 'synced')
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingUpdate skips when booking originated from Google', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    externalSource: 'google',
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'PATCH' })
  const originalFetch = global.fetch
  let fetchCalled = false

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called for Google-originated updates')
  }) as typeof fetch

  try {
    await syncGoogleOnBookingUpdate(booking, req)
    assert.equal(fetchCalled, false)
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})

test('syncGoogleOnBookingDelete deletes the Google event for a QiCu-owned booking', async () => {
  const practitionerId = 'prac-tom-cook'
  const booking = buildBooking({
    externalEventId: 'event-123',
    externalCalendarId: 'calendar-primary',
  })
  const req = new NextRequest('http://localhost:3000/api/bookings/booking-123', { method: 'DELETE' })
  const originalFetch = global.fetch
  let capturedMethod = ''

  saveGoogleIntegration({
    practitionerId,
    connected: true,
    accessToken: 'test-access-token',
    selectedCalendarId: 'calendar-primary',
  })

  global.fetch = (async (_input, init) => {
    capturedMethod = String(init?.method ?? 'GET')
    return new Response(null, { status: 204 })
  }) as typeof fetch

  try {
    await syncGoogleOnBookingDelete(booking, req)
    assert.equal(capturedMethod, 'DELETE')
    assert.equal(booking.externalSyncStatus, 'synced')
  } finally {
    global.fetch = originalFetch
    disconnectGoogleIntegration(practitionerId)
  }
})
