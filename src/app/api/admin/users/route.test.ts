import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq, inArray, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { drizzleDb } from '@/db/client'
import { passwordCredentials, practitioners, users } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import { provisionAuthUser } from '@/lib/auth/provisionUser'
import { AUTH_SESSION_COOKIE_NAME } from '@/lib/auth/sessionCookies'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import { createAuthSession, grantUserRoleByEmail, revokeUserRoleByEmail } from '@/lib/repositories/authRepository'
import { GET as GET_ADMIN_PRACTITIONERS } from '../practitioners/route'
import { POST } from './route'

const originalAdminEmails = process.env.QICU_ADMIN_EMAILS
const createdEmails = new Set<string>()
const AUTH_PROVISIONING_TEST_LOCK = 754301

async function requireDatabaseOrSkip(t: { skip: (message: string) => void }) {
  try {
    await drizzleDb.execute(sql`select 1`)
    return true
  } catch {
    t.skip('PostgreSQL is not available for admin API tests.')
    return false
  }
}

async function withPractitionerState<T>(
  publicIds: Array<keyof typeof demoPractitionerIds>,
  run: () => Promise<T>,
) {
  return drizzleDb.transaction(async (lockTx) => {
    await lockTx.execute(sql`select pg_advisory_xact_lock(${AUTH_PROVISIONING_TEST_LOCK})`)
    const databaseIds = publicIds.map((publicId) => demoPractitionerIds[publicId])
    const before = await drizzleDb
      .select()
      .from(practitioners)
      .where(inArray(practitioners.id, databaseIds))
    const originalUserIds = new Map(before.map((row) => [row.id, row.userId]))

    await drizzleDb
      .update(practitioners)
      .set({ userId: null })
      .where(inArray(practitioners.id, databaseIds))

    try {
      return await run()
    } finally {
      for (const databaseId of databaseIds) {
        await drizzleDb
          .update(practitioners)
          .set({ userId: originalUserIds.get(databaseId) ?? null })
          .where(eq(practitioners.id, databaseId))
      }
    }
  })
}

afterEach(async () => {
  if (originalAdminEmails === undefined) Reflect.deleteProperty(process.env, 'QICU_ADMIN_EMAILS')
  else process.env.QICU_ADMIN_EMAILS = originalAdminEmails

  if (createdEmails.size > 0) {
    try {
      await drizzleDb.delete(users).where(inArray(users.email, [...createdEmails]))
    } catch {
      // Cleanup should not hide test failures.
    }
  }
  createdEmails.clear()
})

function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID()}@example.test`
}

function adminRequest(body: Record<string, unknown>, init: { cookie?: string; origin?: string } = {}) {
  return new NextRequest('http://localhost:3000/api/admin/users', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.origin ? { origin: init.origin } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function createProvisionedSession(email: string, practitionerId: keyof typeof demoPractitionerIds) {
  const input = {
    email,
    name: 'Admin API Test User',
    password: 'StrongPassword123!',
    practitionerId,
    allowRelink: false,
  }
  await provisionAuthUser(input)
  createdEmails.add(email)

  const [user] = await drizzleDb.select().from(users).where(eq(users.email, email)).limit(1)
  assert.ok(user)

  const token = generateSessionToken()
  await createAuthSession(user.id, hashSessionToken(token), createSessionExpiryDate())
  return `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`
}

async function grantAdmin(email: string) {
  const result = await grantUserRoleByEmail(email, 'admin')
  assert.ok(result)
}

function provisionBody(overrides: Record<string, unknown> = {}) {
  const email = uniqueEmail('provisioned')
  createdEmails.add(email)
  return {
    email,
    name: 'Provisioned User',
    password: 'StrongPassword123!',
    practitionerId: 'prac-keita-smith',
    ...overrides,
  }
}

test('admin users API rejects unauthenticated requests', async () => {
  const response = await POST(adminRequest(provisionBody()))

  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Authentication is required.' })
})

test('admin users API rejects authenticated non-admin users', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook'], async () => {
    const nonAdminEmail = uniqueEmail('non-admin')
    const cookie = await createProvisionedSession(nonAdminEmail, 'prac-tom-cook')
    process.env.QICU_ADMIN_EMAILS = uniqueEmail('allowed-admin')

    const response = await POST(adminRequest(provisionBody(), { cookie }))

    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'Admin access is required.' })
  })
})

test('admin users API provisions a user with safe public output', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook', 'prac-keita-smith'], async () => {
    const adminEmail = uniqueEmail('admin')
    const cookie = await createProvisionedSession(adminEmail, 'prac-tom-cook')
    await grantAdmin(adminEmail)
    Reflect.deleteProperty(process.env, 'QICU_ADMIN_EMAILS')
    const body = provisionBody()

    const response = await POST(adminRequest(body, { cookie }))
    const json = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(json, {
      ok: true,
      user: {
        email: body.email,
        name: body.name,
      },
      practitioner: {
        id: 'prac-keita-smith',
        name: 'Keita Smith',
      },
    })

    const [user] = await drizzleDb.select().from(users).where(eq(users.email, body.email)).limit(1)
    const [credential] = await drizzleDb
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, user.id))
      .limit(1)
    const output = JSON.stringify(json)

    assert.ok(user)
    assert.ok(credential)
    assert.notEqual(credential.passwordHash, body.password)
    assert.equal(output.includes(user.id), false)
    assert.equal(output.includes(String(body.password)), false)
    assert.equal(output.includes(credential.passwordHash), false)
  })
})

test('admin access still supports QICU_ADMIN_EMAILS bootstrap fallback', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook', 'prac-keita-smith'], async () => {
    const adminEmail = uniqueEmail('bootstrap-admin')
    const cookie = await createProvisionedSession(adminEmail, 'prac-tom-cook')
    process.env.QICU_ADMIN_EMAILS = adminEmail.toUpperCase()
    const body = provisionBody()

    const response = await POST(adminRequest(body, { cookie }))
    assert.equal(response.status, 200)

    await revokeUserRoleByEmail(adminEmail, 'admin')
  })
})

test('admin practitioners route requires admin and returns safe public fields', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook', 'prac-keita-smith'], async () => {
    const adminEmail = uniqueEmail('admin-list')
    const nonAdminEmail = uniqueEmail('non-admin-list')
    const adminCookie = await createProvisionedSession(adminEmail, 'prac-tom-cook')
    const nonAdminCookie = await createProvisionedSession(nonAdminEmail, 'prac-keita-smith')
    await grantAdmin(adminEmail)
    Reflect.deleteProperty(process.env, 'QICU_ADMIN_EMAILS')

    const anonymous = await GET_ADMIN_PRACTITIONERS(new NextRequest('http://localhost:3000/api/admin/practitioners'))
    assert.equal(anonymous.status, 401)

    const nonAdmin = await GET_ADMIN_PRACTITIONERS(new NextRequest('http://localhost:3000/api/admin/practitioners', {
      headers: { cookie: nonAdminCookie },
    }))
    assert.equal(nonAdmin.status, 403)

    const response = await GET_ADMIN_PRACTITIONERS(new NextRequest('http://localhost:3000/api/admin/practitioners', {
      headers: { cookie: adminCookie },
    }))
    const body = await response.json()
    const output = JSON.stringify(body)

    assert.equal(response.status, 200)
    assert.equal(Array.isArray(body.practitioners), true)
    assert.ok(body.practitioners.some((practitioner: { id: string }) => practitioner.id === 'prac-tom-cook'))
    assert.equal(output.includes(demoPractitionerIds['prac-tom-cook']), false)
    assert.equal(output.includes('passwordHash'), false)
    assert.equal(output.includes('sessionTokenHash'), false)
  })
})

test('admin users API validates practitioner, password, relink, and origin guard', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook', 'prac-keita-smith'], async () => {
    const adminEmail = uniqueEmail('admin')
    const cookie = await createProvisionedSession(adminEmail, 'prac-tom-cook')
    process.env.QICU_ADMIN_EMAILS = adminEmail

    const crossOrigin = await POST(adminRequest(provisionBody(), {
      cookie,
      origin: 'https://evil.example.test',
    }))
    assert.equal(crossOrigin.status, 403)
    assert.deepEqual(await crossOrigin.json(), { error: 'Forbidden' })

    const unknownPractitioner = await POST(adminRequest(provisionBody({ practitionerId: 'missing-practitioner' }), { cookie }))
    assert.equal(unknownPractitioner.status, 400)
    assert.match((await unknownPractitioner.json()).error, /Unknown practitioner public ID/)

    const weakPassword = await POST(adminRequest(provisionBody({ password: 'too-short' }), { cookie }))
    assert.equal(weakPassword.status, 400)
    assert.match((await weakPassword.json()).error, /Password must be at least 12 characters/)

    const linkedEmail = uniqueEmail('linked')
    await provisionAuthUser({
      email: linkedEmail,
      name: 'Linked User',
      password: 'StrongPassword123!',
      practitionerId: 'prac-keita-smith',
      allowRelink: false,
    })
    createdEmails.add(linkedEmail)

    const rejectedRelink = await POST(adminRequest(provisionBody(), { cookie }))
    assert.equal(rejectedRelink.status, 400)
    assert.match((await rejectedRelink.json()).error, /already linked to another user/i)

    const allowedRelinkBody = provisionBody({ allowRelink: true })
    const allowedRelink = await POST(adminRequest(allowedRelinkBody, { cookie }))
    assert.equal(allowedRelink.status, 200)
    assert.equal((await allowedRelink.json()).practitioner.id, 'prac-keita-smith')
  })
})
