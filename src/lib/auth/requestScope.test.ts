import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { drizzleDb } from '@/db/client'
import { practitioners, users } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/sessionCookies'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import { createAuthSession, revokeAuthSession } from '@/lib/repositories/authRepository'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'
import { GET as GET_BOOKINGS } from '@/app/api/bookings/route'
import { GET as GET_GOOGLE_AUTH_URL } from '@/app/api/integrations/google/auth-url/route'
import { getPractitionerScopeForRequest } from './requestScope'

const createdUserIds = new Set<string>()
const linkedPractitionerIds = new Set<string>()
const originalAuthEnforcement = process.env.QICU_AUTH_ENFORCEMENT
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID
const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const originalGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI

async function createUser(linkedPractitionerPublicId?: keyof typeof demoPractitionerIds) {
  const id = randomUUID()
  try {
    const rows = await drizzleDb
      .insert(users)
      .values({
        id,
        email: `scope-${id}@example.test`,
        name: 'Scope Test User',
        authProvider: 'password',
        authProviderUserId: `scope-${id}`,
      })
      .returning()

    createdUserIds.add(id)

    if (linkedPractitionerPublicId) {
      const databasePractitionerId = demoPractitionerIds[linkedPractitionerPublicId]
      await drizzleDb
        .update(practitioners)
        .set({ userId: id })
        .where(eq(practitioners.id, databasePractitionerId))
      linkedPractitionerIds.add(databasePractitionerId)
    }

    return { available: true as const, user: rows[0] }
  } catch {
    return { available: false as const, user: null }
  }
}

async function createSessionCookie(userId: string, options: { expiresAt?: Date; revoked?: boolean } = {}) {
  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  await createAuthSession(userId, tokenHash, options.expiresAt ?? createSessionExpiryDate())
  if (options.revoked) await revokeAuthSession(tokenHash)
  return `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`
}

function setStrictAuth() {
  process.env.QICU_AUTH_ENFORCEMENT = 'strict'
}

afterEach(async () => {
  for (const practitionerId of linkedPractitionerIds) {
    try {
      await drizzleDb.update(practitioners).set({ userId: null }).where(eq(practitioners.id, practitionerId))
    } catch {
      // Cleanup should not hide test failures.
    }
  }
  for (const userId of createdUserIds) {
    try {
      await drizzleDb.delete(users).where(eq(users.id, userId))
    } catch {
      // Cleanup should not hide test failures.
    }
  }
  createdUserIds.clear()
  linkedPractitionerIds.clear()

  if (originalAuthEnforcement === undefined) delete process.env.QICU_AUTH_ENFORCEMENT
  else process.env.QICU_AUTH_ENFORCEMENT = originalAuthEnforcement

  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId
  if (originalGoogleClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET
  else process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret
  if (originalGoogleRedirectUri === undefined) delete process.env.GOOGLE_REDIRECT_URI
  else process.env.GOOGLE_REDIRECT_URI = originalGoogleRedirectUri
})

test('valid session resolves to linked practitioner public ID and wins over conflicting header', async t => {
  const setup = await createUser('prac-tom-cook')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const cookie = await createSessionCookie(setup.user.id)
  const scope = await getPractitionerScopeForRequest(
    new NextRequest('http://localhost:3000/api/bookings', {
      headers: {
        cookie,
        'x-qicu-practitioner-id': 'prac-keita-smith',
      },
    }),
  )

  assert.equal(scope.practitionerId, 'prac-tom-cook')
  assert.equal(scope.source, 'session')
  assert.equal(scope.user?.email, setup.user.email)
  assert.equal(JSON.stringify(scope).includes(demoPractitionerIds['prac-tom-cook']), false)
})

test('strict mode rejects missing, expired, and revoked sessions without header fallback', async t => {
  const setup = await createUser('prac-tom-cook')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()

  await assert.rejects(
    () =>
      getPractitionerScopeForRequest(
        new NextRequest('http://localhost:3000/api/bookings', {
          headers: { 'x-qicu-practitioner-id': 'prac-tom-cook' },
        }),
      ),
    /Authentication is required/,
  )

  const expiredCookie = await createSessionCookie(setup.user.id, { expiresAt: new Date(Date.now() - 60_000) })
  const revokedCookie = await createSessionCookie(setup.user.id, { revoked: true })

  await assert.rejects(
    () => getPractitionerScopeForRequest(new NextRequest('http://localhost:3000/api/bookings', { headers: { cookie: expiredCookie } })),
    /Authentication is required/,
  )
  await assert.rejects(
    () => getPractitionerScopeForRequest(new NextRequest('http://localhost:3000/api/bookings', { headers: { cookie: revokedCookie } })),
    /Authentication is required/,
  )
})

test('legacy mode preserves current header/default behavior', async () => {
  const headerScope = await getPractitionerScopeForRequest(
    new NextRequest('http://localhost:3000/api/bookings', {
      headers: { 'x-qicu-practitioner-id': 'prac-keita-smith' },
    }),
  )
  const defaultScope = await getPractitionerScopeForRequest(new NextRequest('http://localhost:3000/api/bookings'))

  assert.equal(headerScope.practitionerId, 'prac-keita-smith')
  assert.equal(headerScope.source, 'legacy-header')
  assert.equal(defaultScope.practitionerId, 'prac-tom-cook')
  assert.equal(defaultScope.source, 'legacy-header')
})

test('user with no linked practitioner is rejected with a clear scope error', async t => {
  const setup = await createUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const cookie = await createSessionCookie(setup.user.id)

  await assert.rejects(
    () => getPractitionerScopeForRequest(new NextRequest('http://localhost:3000/api/bookings', { headers: { cookie } })),
    /not linked to a practitioner/,
  )
})

test('representative booking route returns 401 in strict mode without session and works with valid session', async t => {
  const setup = await createUser('prac-tom-cook')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()

  const missingSession = await GET_BOOKINGS(
    new NextRequest('http://localhost:3000/api/bookings', {
      headers: { 'x-qicu-practitioner-id': 'prac-tom-cook' },
    }),
  )
  assert.equal(missingSession.status, 401)

  const cookie = await createSessionCookie(setup.user.id)
  const validSession = await GET_BOOKINGS(
    new NextRequest('http://localhost:3000/api/bookings', {
      headers: { cookie, 'x-qicu-practitioner-id': 'prac-keita-smith' },
    }),
  )

  assert.equal(validSession.status, 200)
  assert.ok(Array.isArray(await validSession.json()))
})

test('Google auth-url route creates OAuth state for authenticated practitioner in strict mode', async t => {
  const setup = await createUser('prac-keita-smith')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/integrations/google/callback'

  const cookie = await createSessionCookie(setup.user.id)
  const response = await GET_GOOGLE_AUTH_URL(
    new NextRequest('http://localhost:3000/api/integrations/google/auth-url', {
      headers: { cookie, 'x-qicu-practitioner-id': 'prac-tom-cook' },
    }),
  )
  const body = await response.json()
  const state = new URL(body.url).searchParams.get('state')

  assert.equal(response.status, 200)
  assert.ok(state)

  const pending = await googleIntegrationsRepository.consumeOAuthState(state ?? '')
  assert.equal(pending?.practitionerId, 'prac-keita-smith')
})
