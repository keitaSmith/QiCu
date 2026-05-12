import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { drizzleDb } from '@/db/client'
import { practitioners, users } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/sessionCookies'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import { createAuthSession, revokeAuthSession } from '@/lib/repositories/authRepository'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'
import { GET as GET_BOOKINGS } from '@/app/api/bookings/route'
import { GET as GET_GOOGLE_AUTH_URL } from '@/app/api/integrations/google/auth-url/route'
import { GET as GET_GOOGLE_STATUS } from '@/app/api/integrations/google/status/route'
import { GET as GET_PATIENTS } from '@/app/api/patients/route'
import { GET as GET_SERVICES } from '@/app/api/services/route'
import { GET as GET_SESSIONS } from '@/app/api/sessions/route'
import { GET as GET_TRASH } from '@/app/api/trash/route'
import { getPractitionerScopeForRequest } from './requestScope'

const createdUserIds = new Set<string>()
const linkedPractitionerOriginalUserIds = new Map<string, string | null>()
const originalAuthEnforcement = process.env.QICU_AUTH_ENFORCEMENT
const originalNodeEnv = process.env.NODE_ENV
const mutableEnv = process.env as Record<string, string | undefined>
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
      if (!linkedPractitionerOriginalUserIds.has(databasePractitionerId)) {
        const existing = await drizzleDb
          .select({ userId: practitioners.userId })
          .from(practitioners)
          .where(eq(practitioners.id, databasePractitionerId))
          .limit(1)
        linkedPractitionerOriginalUserIds.set(databasePractitionerId, existing[0]?.userId ?? null)
      }
      await drizzleDb
        .update(practitioners)
        .set({ userId: id })
        .where(eq(practitioners.id, databasePractitionerId))
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

function setProductionLikeAuth() {
  Reflect.deleteProperty(process.env, 'QICU_AUTH_ENFORCEMENT')
  mutableEnv.NODE_ENV = 'production'
}

afterEach(async () => {
  for (const [practitionerId, originalUserId] of linkedPractitionerOriginalUserIds) {
    try {
      await drizzleDb
        .update(practitioners)
        .set({ userId: originalUserId })
        .where(eq(practitioners.id, practitionerId))
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
  linkedPractitionerOriginalUserIds.clear()

  if (originalAuthEnforcement === undefined) Reflect.deleteProperty(process.env, 'QICU_AUTH_ENFORCEMENT')
  else process.env.QICU_AUTH_ENFORCEMENT = originalAuthEnforcement
  if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV')
  else mutableEnv.NODE_ENV = originalNodeEnv

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
  mutableEnv.NODE_ENV = 'development'
  Reflect.deleteProperty(process.env, 'QICU_AUTH_ENFORCEMENT')
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

test('production defaults to strict scope and rejects legacy header fallback without a session', async () => {
  setProductionLikeAuth()

  await assert.rejects(
    () =>
      getPractitionerScopeForRequest(
        new NextRequest('http://localhost:3000/api/bookings', {
          headers: { 'x-qicu-practitioner-id': 'prac-tom-cook' },
        }),
      ),
    /Authentication is required/,
  )
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
  const bookings = await validSession.json()
  assert.ok(Array.isArray(bookings))
  assert.equal(bookings.every((booking: { practitionerId?: string }) => booking.practitionerId === 'prac-tom-cook'), true)
})

test('production strict-by-default mode ignores spoofed headers and uses the authenticated practitioner session', async t => {
  const setup = await createUser('prac-keita-smith')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setProductionLikeAuth()

  const cookie = await createSessionCookie(setup.user.id)
  const response = await GET_BOOKINGS(
    new NextRequest('http://localhost:3000/api/bookings', {
      headers: { cookie, 'x-qicu-practitioner-id': 'prac-tom-cook' },
    }),
  )

  assert.equal(response.status, 200)
  const bookings = await response.json()
  assert.equal(bookings.every((booking: { practitionerId?: string }) => booking.practitionerId === 'prac-keita-smith'), true)
})

test('representative protected routes return 401 in strict mode without a session', async t => {
  const setup = await createUser('prac-tom-cook')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()

  const routes: Array<[string, (req: NextRequest) => Promise<Response>]> = [
    ['/api/patients', GET_PATIENTS],
    ['/api/services', GET_SERVICES],
    ['/api/sessions', GET_SESSIONS],
    ['/api/trash', GET_TRASH],
    ['/api/integrations/google/status', GET_GOOGLE_STATUS],
  ]

  for (const [path, handler] of routes) {
    const response = await handler(
      new NextRequest(`http://localhost:3000${path}`, {
        headers: { 'x-qicu-practitioner-id': 'prac-tom-cook' },
      }),
    )
    assert.equal(response.status, 401, path)
  }
})

test('representative protected routes work in strict mode with a valid session', async t => {
  const setup = await createUser('prac-tom-cook')
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()
  const cookie = await createSessionCookie(setup.user.id)

  const routes: Array<[string, (req: NextRequest) => Promise<Response>]> = [
    ['/api/patients', GET_PATIENTS],
    ['/api/services', GET_SERVICES],
    ['/api/sessions', GET_SESSIONS],
    ['/api/trash', GET_TRASH],
    ['/api/integrations/google/status', GET_GOOGLE_STATUS],
  ]

  for (const [path, handler] of routes) {
    const response = await handler(
      new NextRequest(`http://localhost:3000${path}`, {
        headers: { cookie, 'x-qicu-practitioner-id': 'prac-keita-smith' },
      }),
    )
    assert.equal(response.status, 200, path)
  }
})

test('representative protected route returns 403 for authenticated user without linked practitioner', async t => {
  const setup = await createUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }
  setStrictAuth()

  const cookie = await createSessionCookie(setup.user.id)
  const response = await GET_SERVICES(
    new NextRequest('http://localhost:3000/api/services', {
      headers: { cookie, 'x-qicu-practitioner-id': 'prac-tom-cook' },
    }),
  )
  const body = await response.json()

  assert.equal(response.status, 403)
  assert.equal(body.error, 'Authenticated user is not linked to a practitioner.')
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

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return collectRouteFiles(fullPath)
    return entry.name === 'route.ts' ? [fullPath] : []
  })
}

test('runtime API routes use the auth-response scope helper instead of direct practitioner scope calls', () => {
  const apiRoot = join(process.cwd(), 'src', 'app', 'api')
  const directScopeCallers = collectRouteFiles(apiRoot).filter(file => {
    const source = readFileSync(file, 'utf8')
    return source.includes('getPractitionerIdFromRequest')
  })

  assert.deepEqual(directScopeCallers, [])
})
