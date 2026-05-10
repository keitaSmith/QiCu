import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { googleIntegrations } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import { disconnectGoogleIntegration } from '@/lib/google/store'
import {
  consumeOAuthState,
  createOAuthState,
  disconnect,
  getIntegration,
  getSelectedCalendar,
  getStatus,
  getUsableIntegration,
  saveIntegration,
  saveSelectedCalendar,
} from './googleIntegrationsRepository'

const practitionerId = 'prac-repo-google'
const otherPractitionerId = 'prac-repo-google-other'
const seededPractitionerId = 'prac-tom-cook'
const seededOtherPractitionerId = 'prac-keita-smith'
const originalEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

function setGoogleTokenEncryptionTestKey() {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
}

async function loadGoogleIntegrationMetadata(practitionerId: string) {
  const databasePractitionerId =
    demoPractitionerIds[practitionerId as keyof typeof demoPractitionerIds]
  if (!databasePractitionerId) return { available: false as const, row: null }

  try {
    const rows = await drizzleDb
      .select()
      .from(googleIntegrations)
      .where(eq(googleIntegrations.practitionerId, databasePractitionerId))
      .limit(1)

    return { available: true as const, row: rows[0] ?? null }
  } catch {
    return { available: false as const, row: null }
  }
}

afterEach(async () => {
  await disconnect(practitionerId)
  await disconnect(otherPractitionerId)
  await disconnect(seededPractitionerId)
  await disconnect(seededOtherPractitionerId)
  if (originalEncryptionKey === undefined) {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  } else {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = originalEncryptionKey
  }
})

test('getStatus returns disconnected public state when no integration exists', async () => {
  const status = await getStatus(practitionerId)

  assert.deepEqual(status, {
    connected: false,
    googleUserEmail: undefined,
    selectedCalendarId: undefined,
    selectedCalendarName: undefined,
    lastError: null,
  })
})

test('saveIntegration stores state scoped by practitioner and status hides tokens', async () => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(practitionerId, {
    connected: true,
    googleUserEmail: 'repo@example.com',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    selectedCalendarId: 'calendar-1',
    selectedCalendarName: 'Clinic calendar',
    lastError: null,
  })

  const integration = getIntegration(practitionerId)
  assert.equal(integration.accessToken, 'fake-access-token')
  assert.equal(integration.refreshToken, 'fake-refresh-token')

  const status = await getStatus(practitionerId)
  assert.equal(status.connected, true)
  assert.equal(status.googleUserEmail, 'repo@example.com')
  assert.equal('accessToken' in status, false)
  assert.equal('refreshToken' in status, false)

  assert.equal((await getStatus(otherPractitionerId)).connected, false)
})

test('saveSelectedCalendar stores calendar selection scoped by practitioner', async () => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(practitionerId, {
    connected: true,
    accessToken: 'fake-access-token',
    lastError: null,
  })

  const updated = await saveSelectedCalendar(practitionerId, {
    calendarId: 'calendar-selected',
    calendarName: 'Selected Calendar',
  })

  assert.equal(updated.selectedCalendarId, 'calendar-selected')
  assert.deepEqual(getSelectedCalendar(practitionerId), {
    id: 'calendar-selected',
    name: 'Selected Calendar',
  })
  assert.equal(getSelectedCalendar(otherPractitionerId), null)
})

test('disconnect clears only the scoped integration', async () => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(practitionerId, { connected: true, accessToken: 'fake-access-token' })
  await saveIntegration(otherPractitionerId, { connected: true, accessToken: 'other-fake-token' })

  await disconnect(practitionerId)

  assert.equal((await getStatus(practitionerId)).connected, false)
  assert.equal((await getStatus(otherPractitionerId)).connected, true)
})

test('saveIntegration persists encrypted tokens without plaintext leakage', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    googleUserEmail: 'seeded-google@example.com',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    tokenExpiry: Date.now() + 3600_000,
    selectedCalendarId: 'calendar-seeded',
    selectedCalendarName: 'Seeded Calendar',
    lastError: null,
    connectedAt: '2026-05-10T08:30:00.000Z',
  })

  const { available, row: metadata } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  assert.equal(metadata?.connected, true)
  assert.equal(metadata?.googleUserEmail, 'seeded-google@example.com')
  assert.equal(metadata?.selectedCalendarId, 'calendar-seeded')
  assert.equal(metadata?.selectedCalendarName, 'Seeded Calendar')
  assert.equal(metadata?.accessTokenEncrypted?.includes('test-access-token'), false)
  assert.equal(metadata?.refreshTokenEncrypted?.includes('test-refresh-token'), false)
  assert.notEqual(metadata?.accessTokenEncrypted, null)
  assert.notEqual(metadata?.refreshTokenEncrypted, null)
  assert.notEqual(metadata?.tokenExpiry, null)

  disconnectGoogleIntegration(seededPractitionerId)
  const usable = await getUsableIntegration(seededPractitionerId)

  assert.equal(usable.connected, true)
  assert.equal(usable.accessToken, 'test-access-token')
  assert.equal(usable.refreshToken, 'test-refresh-token')
})

test('selected calendar metadata persists for the scoped practitioner only', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    accessToken: 'fake-access-token',
  })
  await saveIntegration(seededOtherPractitionerId, {
    connected: true,
    accessToken: 'other-fake-access-token',
  })

  await saveSelectedCalendar(seededPractitionerId, {
    calendarId: 'calendar-tom',
    calendarName: 'Tom Calendar',
  })

  const { available, row: metadata } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  const { available: otherAvailable, row: otherMetadata } =
    await loadGoogleIntegrationMetadata(seededOtherPractitionerId)
  if (!available || !otherAvailable) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  assert.equal(metadata?.selectedCalendarId, 'calendar-tom')
  assert.equal(metadata?.selectedCalendarName, 'Tom Calendar')
  assert.equal(otherMetadata?.selectedCalendarId, null)
})

test('disconnect clears persisted metadata and runtime token state', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    googleUserEmail: 'disconnect@example.com',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    selectedCalendarId: 'calendar-disconnect',
    selectedCalendarName: 'Disconnect Calendar',
  })

  await disconnect(seededPractitionerId)

  const { available, row: metadata } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }
  const status = await getStatus(seededPractitionerId)

  assert.equal(metadata?.connected, false)
  assert.equal(metadata?.selectedCalendarId, null)
  assert.equal(metadata?.selectedCalendarName, null)
  assert.equal(metadata?.accessTokenEncrypted, null)
  assert.equal(metadata?.refreshTokenEncrypted, null)
  assert.equal(metadata?.tokenExpiry, null)
  assert.equal(status.connected, false)
  assert.equal(getIntegration(seededPractitionerId).connected, false)
})

test('status does not claim a usable connection from DB metadata alone', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    googleUserEmail: 'metadata-only@example.com',
    selectedCalendarId: 'calendar-metadata',
    selectedCalendarName: 'Metadata Calendar',
  })

  disconnectGoogleIntegration(seededPractitionerId)

  const { available } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  const status = await getStatus(seededPractitionerId)

  assert.equal(status.connected, false)
  assert.equal(status.googleUserEmail, 'metadata-only@example.com')
  assert.equal(status.selectedCalendarId, 'calendar-metadata')
})

test('status reports connected from encrypted DB tokens when decryptable', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    googleUserEmail: 'restart@example.com',
    accessToken: 'restart-access-token',
    refreshToken: 'restart-refresh-token',
    tokenExpiry: Date.now() + 3600_000,
    selectedCalendarId: 'calendar-restart',
    selectedCalendarName: 'Restart Calendar',
  })

  const { available } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  disconnectGoogleIntegration(seededPractitionerId)

  const status = await getStatus(seededPractitionerId)

  assert.equal(status.connected, true)
  assert.equal(status.googleUserEmail, 'restart@example.com')
  assert.equal(status.selectedCalendarId, 'calendar-restart')
})

test('missing encryption key fails closed for DB token persistence', async t => {
  const { available } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

  await assert.rejects(
    saveIntegration(seededPractitionerId, {
      connected: true,
      accessToken: 'token-without-key',
    }),
    /GOOGLE_TOKEN_ENCRYPTION_KEY is required/,
  )
})

test('refresh token is preserved when a later save only has a new access token', async t => {
  setGoogleTokenEncryptionTestKey()
  await saveIntegration(seededPractitionerId, {
    connected: true,
    accessToken: 'original-access-token',
    refreshToken: 'original-refresh-token',
    tokenExpiry: Date.now() + 3600_000,
  })

  const { available } = await loadGoogleIntegrationMetadata(seededPractitionerId)
  if (!available) {
    t.skip('PostgreSQL metadata table is not available for this test run.')
    return
  }

  await saveIntegration(seededPractitionerId, {
    connected: true,
    accessToken: 'refreshed-access-token',
    tokenExpiry: Date.now() + 7200_000,
  })

  disconnectGoogleIntegration(seededPractitionerId)
  const usable = await getUsableIntegration(seededPractitionerId)

  assert.equal(usable.accessToken, 'refreshed-access-token')
  assert.equal(usable.refreshToken, 'original-refresh-token')
})

test('OAuth state creation and consume behavior remains one-time', async () => {
  const state = await createOAuthState(seededPractitionerId)
  const consumed = await consumeOAuthState(state)

  assert.equal(consumed?.practitionerId, seededPractitionerId)
  assert.equal(typeof consumed?.createdAt, 'number')
  assert.equal(await consumeOAuthState(state), undefined)
  assert.equal(await consumeOAuthState('missing-state'), undefined)
})

test('OAuth state rejects expired rows when database persistence is available', async () => {
  const now = new Date('2026-05-10T10:00:00.000Z')
  const state = await createOAuthState('prac-tom-cook', {
    now,
    ttlMs: 60_000,
  })

  const consumed = await consumeOAuthState(state, {
    now: new Date('2026-05-10T10:02:00.000Z'),
  })

  assert.equal(consumed, undefined)
})
