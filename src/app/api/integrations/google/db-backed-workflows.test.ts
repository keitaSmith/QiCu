import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, test, type TestContext } from 'node:test'

import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { drizzleDb } from '@/db/client'
import { bookings, googleIntegrations } from '@/db/schema'
import { disconnectGoogleIntegration } from '@/lib/google/store'
import {
  syncGoogleOnBookingCreate,
  syncGoogleOnBookingDelete,
  syncGoogleOnBookingUpdate,
} from '@/lib/google/sync'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'
import type { Booking } from '@/models/booking'
import { POST as SELECT_CALENDAR } from './calendar-selection/route'
import { GET as CALENDARS } from './calendars/route'
import { GET as EVENTS_PREVIEW } from './events-preview/route'
import { POST as RECONCILE } from './reconcile/route'

const practitionerId = 'prac-tom-cook'
const otherPractitionerId = 'prac-keita-smith'
const originalEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
const originalClientId = process.env.GOOGLE_CLIENT_ID
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET

type FetchCall = {
  url: string
  init?: RequestInit
}

type TestRequestInit = {
  method?: string
  headers?: HeadersInit
  body?: BodyInit | null
}

function setGoogleTokenEncryptionTestKey() {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
}

async function requireDb(t: TestContext) {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is not set; DB-backed Google workflow test skipped.')
    return false
  }

  try {
    await drizzleDb.select().from(googleIntegrations).limit(1)
    return true
  } catch {
    t.skip('PostgreSQL is not available; DB-backed Google workflow test skipped.')
    return false
  }
}

function request(path: string, init: TestRequestInit = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    ...init,
    headers: {
      'x-qicu-practitioner-id': practitionerId,
      ...(init.headers ?? {}),
    },
  })
}

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: overrides.id ?? `b-g5-${crypto.randomUUID()}`,
    code: overrides.code ?? 'BKG-G5-TEST',
    practitionerId,
    patientId: overrides.patientId ?? 'P-T-1001',
    serviceId: overrides.serviceId ?? 'tom-acu-60',
    serviceName: overrides.serviceName ?? 'Acupuncture',
    serviceDurationMinutes: overrides.serviceDurationMinutes ?? 60,
    start: overrides.start ?? '2026-05-12T09:00:00.000Z',
    end: overrides.end ?? '2026-05-12T10:00:00.000Z',
    status: overrides.status ?? 'confirmed',
    resource: overrides.resource,
    notes: overrides.notes,
    externalSource: overrides.externalSource ?? null,
    externalCalendarId: overrides.externalCalendarId ?? null,
    externalEventId: overrides.externalEventId ?? null,
    externalSyncStatus: overrides.externalSyncStatus ?? null,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function assertBearer(init: RequestInit | undefined, expectedToken: string) {
  const headers = new Headers(init?.headers)
  assert.equal(headers.get('Authorization'), `Bearer ${expectedToken}`)
}

function assertNoTokenPayload(value: unknown, tokens: string[]) {
  const serialized = JSON.stringify(value)
  for (const token of tokens) {
    assert.equal(serialized.includes(token), false)
  }
  assert.equal(serialized.includes('accessToken'), false)
  assert.equal(serialized.includes('refreshToken'), false)
  assert.equal(serialized.includes('access_token_encrypted'), false)
  assert.equal(serialized.includes('Authorization'), false)
}

async function saveRestartableIntegration(overrides: {
  accessToken?: string
  refreshToken?: string
  tokenExpiry?: number
  selectedCalendarId?: string
  selectedCalendarName?: string
} = {}) {
  await googleIntegrationsRepository.saveIntegration(practitionerId, {
    connected: true,
    googleUserEmail: 'g5@example.com',
    accessToken: overrides.accessToken ?? 'db-access-token',
    refreshToken: overrides.refreshToken ?? 'db-refresh-token',
    tokenExpiry: overrides.tokenExpiry ?? Date.now() + 3600_000,
    selectedCalendarId: overrides.selectedCalendarId,
    selectedCalendarName: overrides.selectedCalendarName,
    lastError: null,
  })
  disconnectGoogleIntegration(practitionerId)
}

function restoreEnv(name: 'GOOGLE_TOKEN_ENCRYPTION_KEY' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET', original: string | undefined) {
  if (original === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = original
  }
}

afterEach(async () => {
  global.fetch = originalFetch
  await googleIntegrationsRepository.disconnect(practitionerId)
  await googleIntegrationsRepository.disconnect(otherPractitionerId)
  restoreEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', originalEncryptionKey)
  restoreEnv('GOOGLE_CLIENT_ID', originalClientId)
  restoreEnv('GOOGLE_CLIENT_SECRET', originalClientSecret)
})

const originalFetch = global.fetch

test('calendar list uses encrypted DB-backed tokens after runtime reset', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration()

  const calls: FetchCall[] = []
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init })
    assertBearer(init, 'db-access-token')
    return jsonResponse({
      items: [
        { id: 'calendar-primary', summary: 'Primary Calendar', primary: true },
      ],
    })
  }) as typeof fetch

  const response = await CALENDARS(request('/api/integrations/google/calendars'))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.calendars[0].id, 'calendar-primary')
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /calendarList$/)
  assertNoTokenPayload(payload, ['db-access-token', 'db-refresh-token'])

  disconnectGoogleIntegration(practitionerId)
  const status = await googleIntegrationsRepository.getStatus(practitionerId)
  assert.equal(status.connected, true)
  assert.equal(status.selectedCalendarId, 'calendar-primary')
})

test('calendar list fails closed with a non-sensitive error when token decryption is unavailable', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration()
  disconnectGoogleIntegration(practitionerId)
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'invalid-key'

  let fetchCalled = false
  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called without decryptable tokens')
  }) as typeof fetch

  const response = await CALENDARS(request('/api/integrations/google/calendars'))
  const payload = await response.json()

  assert.equal(response.status, 400)
  assert.equal(fetchCalled, false)
  assertNoTokenPayload(payload, ['db-access-token', 'db-refresh-token'])
})

test('selected calendar persists through DB-backed metadata and stays practitioner scoped', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration()
  await googleIntegrationsRepository.saveIntegration(otherPractitionerId, {
    connected: true,
    accessToken: 'other-db-access-token',
    refreshToken: 'other-db-refresh-token',
    tokenExpiry: Date.now() + 3600_000,
  })
  disconnectGoogleIntegration(practitionerId)
  disconnectGoogleIntegration(otherPractitionerId)

  const response = await SELECT_CALENDAR(
    request('/api/integrations/google/calendar-selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 'calendar-selected',
        calendarName: 'Selected Calendar',
      }),
    }),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.selectedCalendarId, 'calendar-selected')
  assertNoTokenPayload(payload, ['db-access-token', 'db-refresh-token'])

  disconnectGoogleIntegration(practitionerId)
  const status = await googleIntegrationsRepository.getStatus(practitionerId)
  const otherStatus = await googleIntegrationsRepository.getStatus(otherPractitionerId)
  assert.equal(status.selectedCalendarId, 'calendar-selected')
  assert.equal(otherStatus.selectedCalendarId, undefined)
})

test('events preview uses encrypted DB-backed tokens and preserves response shape', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration({
    selectedCalendarId: 'calendar-preview',
    selectedCalendarName: 'Preview Calendar',
  })

  global.fetch = (async (input, init) => {
    assert.match(String(input), /calendar-preview\/events/)
    assertBearer(init, 'db-access-token')
    return jsonResponse({
      items: [
        {
          id: 'event-blocked-1',
          summary: 'Team meeting',
          start: { dateTime: '2026-05-12T09:00:00.000Z' },
          end: { dateTime: '2026-05-12T10:00:00.000Z' },
        },
      ],
    })
  }) as typeof fetch

  const response = await EVENTS_PREVIEW(
    request('/api/integrations/google/events-preview?from=2026-05-12T00:00:00.000Z&to=2026-05-13T00:00:00.000Z&mode=timed-events'),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(Array.isArray(payload.rows), true)
  assert.equal(payload.rows[0].externalEventId, 'event-blocked-1')
  assert.equal(payload.rows[0].importClassification, 'blocked-time-candidate')
  assertNoTokenPayload(payload, ['db-access-token', 'db-refresh-token'])
})

test('reconcile uses encrypted DB-backed tokens and persisted booking external fields', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration({
    selectedCalendarId: 'calendar-reconcile',
    selectedCalendarName: 'Reconcile Calendar',
  })

  const rows = await drizzleDb
    .select()
    .from(bookings)
    .where(eq(bookings.publicId, 'b-tom-today-001'))
    .limit(1)
  const originalBooking = rows[0]
  assert.ok(originalBooking)

  await drizzleDb
    .update(bookings)
    .set({
      deletedAt: null,
      restoreUntil: null,
      deletedByPractitionerId: null,
      deletionGroupId: null,
      deletionType: null,
      deletionReason: null,
      externalSource: 'google',
      externalCalendarId: 'calendar-reconcile',
      externalEventId: 'event-reconcile-1',
      externalSyncStatus: 'imported',
    })
    .where(eq(bookings.id, originalBooking.id))

  try {
    global.fetch = (async (input, init) => {
      assert.match(String(input), /calendar-reconcile\/events\/event-reconcile-1$/)
      assertBearer(init, 'db-access-token')
      return jsonResponse({
        id: 'event-reconcile-1',
        status: 'confirmed',
        summary: 'Reconciled event',
        start: { dateTime: originalBooking.startAt.toISOString() },
        end: { dateTime: originalBooking.endAt.toISOString() },
      })
    }) as typeof fetch

    const response = await RECONCILE(
      request('/api/integrations/google/reconcile', { method: 'POST' }),
    )
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.ok, true)
    assert.equal(typeof payload.linked, 'number')
    assert.equal(typeof payload.unchanged, 'number')
    assertNoTokenPayload(payload, ['db-access-token', 'db-refresh-token'])
  } finally {
    await drizzleDb
      .update(bookings)
      .set({
        deletedAt: originalBooking.deletedAt,
        restoreUntil: originalBooking.restoreUntil,
        deletedByPractitionerId: originalBooking.deletedByPractitionerId,
        deletionGroupId: originalBooking.deletionGroupId,
        deletionType: originalBooking.deletionType,
        deletionReason: originalBooking.deletionReason,
        externalSource: originalBooking.externalSource,
        externalCalendarId: originalBooking.externalCalendarId,
        externalEventId: originalBooking.externalEventId,
        externalSyncStatus: originalBooking.externalSyncStatus,
        externalLastSyncedAt: originalBooking.externalLastSyncedAt,
      })
      .where(eq(bookings.id, originalBooking.id))
  }
})

test('booking create, update, and delete sync use encrypted DB-backed tokens', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration({
    selectedCalendarId: 'calendar-sync',
    selectedCalendarName: 'Sync Calendar',
  })

  const methods: string[] = []
  global.fetch = (async (_input, init) => {
    assertBearer(init, 'db-access-token')
    const method = String(init?.method ?? 'GET')
    methods.push(method)
    if (method === 'POST') return jsonResponse({ id: 'event-created-1' })
    if (method === 'PATCH') return jsonResponse({ id: 'event-created-1' })
    return new Response(null, { status: 204 })
  }) as typeof fetch

  const req = request('/api/bookings', { method: 'POST' })
  const booking = buildBooking()

  await syncGoogleOnBookingCreate(booking, req)
  assert.equal(booking.externalCalendarId, 'calendar-sync')
  assert.equal(booking.externalEventId, 'event-created-1')
  assert.equal(booking.externalSyncStatus, 'synced')

  booking.serviceName = 'Follow-up acupuncture'
  await syncGoogleOnBookingUpdate(booking, req)
  assert.equal(booking.externalSyncStatus, 'synced')

  await syncGoogleOnBookingDelete(booking, req)
  assert.equal(booking.externalSyncStatus, 'synced')
  assert.deepEqual(methods, ['POST', 'PATCH', 'DELETE'])
})

test('booking sync fallback remains local and non-sensitive when DB token operation fails', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  await saveRestartableIntegration({
    selectedCalendarId: 'calendar-sync-failure',
    selectedCalendarName: 'Sync Failure Calendar',
  })
  disconnectGoogleIntegration(practitionerId)
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

  let fetchCalled = false
  const loggedErrors: unknown[][] = []
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args)
  }
  global.fetch = (async () => {
    fetchCalled = true
    throw new Error('fetch should not be called without decryptable tokens')
  }) as typeof fetch

  try {
    const booking = buildBooking()
    await syncGoogleOnBookingCreate(booking, request('/api/bookings', { method: 'POST' }))

    assert.equal(fetchCalled, false)
    assert.equal(booking.externalSyncStatus, 'error')
    assert.equal(loggedErrors.length, 1)
    assertNoTokenPayload(loggedErrors, ['db-access-token', 'db-refresh-token'])
  } finally {
    console.error = originalConsoleError
  }
})

test('token refresh from downstream calendar workflow persists encrypted access token updates', async t => {
  if (!(await requireDb(t))) return
  setGoogleTokenEncryptionTestKey()
  process.env.GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
  await saveRestartableIntegration({
    accessToken: 'expired-access-token',
    refreshToken: 'stable-refresh-token',
    tokenExpiry: Date.now() - 60_000,
    selectedCalendarId: 'calendar-refresh',
    selectedCalendarName: 'Refresh Calendar',
  })

  const calls: FetchCall[] = []
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), init })
    if (String(input).includes('oauth2.googleapis.com/token')) {
      assert.equal(String(init?.body ?? '').includes('stable-refresh-token'), true)
      return jsonResponse({ access_token: 'refreshed-access-token', expires_in: 3600 })
    }

    assertBearer(init, 'refreshed-access-token')
    return jsonResponse({ items: [{ id: 'calendar-refresh', summary: 'Refresh Calendar' }] })
  }) as typeof fetch

  const response = await CALENDARS(request('/api/integrations/google/calendars'))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.calendars[0].id, 'calendar-refresh')
  assert.equal(calls.length, 2)
  assertNoTokenPayload(payload, [
    'expired-access-token',
    'refreshed-access-token',
    'stable-refresh-token',
  ])

  disconnectGoogleIntegration(practitionerId)
  const usable = await googleIntegrationsRepository.getUsableIntegration(practitionerId)
  assert.equal(usable.accessToken, 'refreshed-access-token')
  assert.equal(usable.refreshToken, 'stable-refresh-token')
  assert.ok((usable.tokenExpiry ?? 0) > Date.now())

  const rows = await drizzleDb
    .select()
    .from(googleIntegrations)
    .where(eq(googleIntegrations.practitionerId, '11111111-1111-4111-8111-111111111111'))
    .limit(1)
  const row = rows[0]
  assert.ok(row)
  assert.equal(row.accessTokenEncrypted?.includes('refreshed-access-token'), false)
  assert.equal(row.refreshTokenEncrypted?.includes('stable-refresh-token'), false)
})
