import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { drizzleDb } from '@/db/client'
import { authSessions, users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/sessionCookies'
import { getCurrentAuthSessionFromRequest } from '@/lib/auth/session'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import {
  createAuthSession,
  createPasswordCredential,
  getValidAuthSessionByTokenHash,
} from '@/lib/repositories/authRepository'
import { POST as LOGIN } from './login/route'
import { POST as LOGOUT } from './logout/route'
import { GET as ME } from './me/route'

const createdUserIds = new Set<string>()

async function createTestUser(password = 'test password that is long enough') {
  const id = randomUUID()
  try {
    const rows = await drizzleDb
      .insert(users)
      .values({
        id,
        email: `auth-route-${id}@example.test`,
        name: 'Auth Route Test User',
        authProvider: 'password',
        authProviderUserId: `auth-route-${id}`,
      })
      .returning()

    const passwordResult = await hashPassword(password)
    await createPasswordCredential(id, passwordResult.hash, passwordResult.algorithm)
    createdUserIds.add(id)
    return { available: true as const, user: rows[0], password }
  } catch {
    return { available: false as const, user: null, password }
  }
}

async function createBareTestUser() {
  const id = randomUUID()
  try {
    const rows = await drizzleDb
      .insert(users)
      .values({
        id,
        email: `auth-session-${id}@example.test`,
        name: 'Auth Session Test User',
        authProvider: 'password',
        authProviderUserId: `auth-session-${id}`,
      })
      .returning()

    createdUserIds.add(id)
    return { available: true as const, user: rows[0] }
  } catch {
    return { available: false as const, user: null }
  }
}

afterEach(async () => {
  for (const userId of createdUserIds) {
    try {
      await drizzleDb.delete(users).where(eq(users.id, userId))
    } catch {
      // Cleanup should not hide test failures.
    }
  }
  createdUserIds.clear()
})

function buildJsonRequest(path: string, body: Record<string, unknown>, init?: { origin?: string; cookie?: string }) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init?.origin ? { origin: init.origin } : {}),
      ...(init?.cookie ? { cookie: init.cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

function getSetCookie(response: Response) {
  return response.headers.get('set-cookie') ?? ''
}

function getSessionCookieValue(response: Response) {
  const setCookie = getSetCookie(response)
  const match = setCookie.match(new RegExp(`${AUTH_SESSION_COOKIE_NAME}=([^;]+)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

test('login succeeds with valid credentials and sets an HttpOnly session cookie', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const response = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: `  ${setup.user.email.toUpperCase()}  `,
    password: setup.password,
  }))
  const body = await response.json()
  const setCookie = getSetCookie(response)
  const cookieValue = getSessionCookieValue(response)

  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    user: {
      email: setup.user.email,
      name: setup.user.name,
    },
  })
  assert.ok(cookieValue)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  assert.match(setCookie, /Path=\//i)
  assert.equal(cookieValue?.includes(setup.user.id), false)
  assert.equal(cookieValue?.includes(setup.user.email), false)

  const tokenHash = hashSessionToken(cookieValue ?? '')
  const session = await getValidAuthSessionByTokenHash(tokenHash)
  assert.ok(session)
  assert.equal(session.userId, setup.user.id)
  assert.notEqual(session.sessionTokenHash, cookieValue)

  const rows = await drizzleDb.select().from(authSessions).where(eq(authSessions.id, session.id))
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].sessionTokenHash, cookieValue)
})

test('login rejects wrong password and unknown email with the same generic error', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const wrongPassword = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: setup.user.email,
    password: 'wrong password that is long enough',
  }))
  const unknownEmail = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: `missing-${randomUUID()}@example.test`,
    password: 'wrong password that is long enough',
  }))

  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownEmail.status, 401)
  assert.deepEqual(await wrongPassword.json(), await unknownEmail.json())
})

test('login rejects malformed body and cross-origin requests', async () => {
  const malformed = await LOGIN(new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.test' }),
  }))
  const crossOrigin = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: 'nobody@example.test',
    password: 'test password that is long enough',
  }, { origin: 'https://evil.example.test' }))

  assert.equal(malformed.status, 400)
  assert.equal(crossOrigin.status, 403)
})

test('logout revokes the session and clears the cookie', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const login = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: setup.user.email,
    password: setup.password,
  }))
  const token = getSessionCookieValue(login)
  assert.ok(token)

  const logout = await LOGOUT(new NextRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token ?? '')}` },
  }))

  assert.equal(logout.status, 200)
  assert.deepEqual(await logout.json(), { ok: true })
  assert.match(getSetCookie(logout), new RegExp(`${AUTH_SESSION_COOKIE_NAME}=;`))
  assert.match(getSetCookie(logout), /Max-Age=0/i)
  assert.equal(await getValidAuthSessionByTokenHash(hashSessionToken(token ?? '')), null)
})

test('logout returns ok even if no session exists', async () => {
  const response = await LOGOUT(new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('current-session helper accepts valid sessions and rejects expired or revoked sessions', async t => {
  const setup = await createBareTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const validToken = generateSessionToken()
  const expiredToken = generateSessionToken()
  const revokedToken = generateSessionToken()

  await createAuthSession(setup.user.id, hashSessionToken(validToken), createSessionExpiryDate())
  await createAuthSession(setup.user.id, hashSessionToken(expiredToken), new Date(Date.now() - 60_000))
  await createAuthSession(setup.user.id, hashSessionToken(revokedToken), createSessionExpiryDate())
  await drizzleDb
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.sessionTokenHash, hashSessionToken(revokedToken)))

  const validContext = await getCurrentAuthSessionFromRequest(
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(validToken)}` },
    }),
  )
  const expiredContext = await getCurrentAuthSessionFromRequest(
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(expiredToken)}` },
    }),
  )
  const revokedContext = await getCurrentAuthSessionFromRequest(
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(revokedToken)}` },
    }),
  )

  assert.equal(validContext?.user.email, setup.user.email)
  assert.equal(expiredContext, null)
  assert.equal(revokedContext, null)
})

test('/api/auth/me returns safe public auth state', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const login = await LOGIN(buildJsonRequest('/api/auth/login', {
    email: setup.user.email,
    password: setup.password,
  }))
  const token = getSessionCookieValue(login)
  assert.ok(token)

  const response = await ME(new NextRequest('http://localhost:3000/api/auth/me', {
    headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token ?? '')}` },
  }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-qicu-auth-enforcement'), 'legacy')
  assert.equal(body.authenticated, true)
  assert.equal(body.user.email, setup.user.email)
  assert.equal(body.user.id, undefined)
  assert.equal(body.sessionTokenHash, undefined)
  assert.equal(body.passwordHash, undefined)
  assert.equal(JSON.stringify(body).includes(token ?? ''), false)

  const anonymous = await ME(new NextRequest('http://localhost:3000/api/auth/me'))
  assert.equal(anonymous.headers.get('x-qicu-auth-enforcement'), 'legacy')
  assert.deepEqual(await anonymous.json(), { authenticated: false })
})
