import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { eq, inArray, sql } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { practitioners, users } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import { listUserRolesByEmail } from '@/lib/repositories/authRepository'
import { provisionAuthUser } from '@/lib/auth/provisionUser'
import {
  grantAdminRole,
  printAdminRoleSummary,
  readAdminRoleCommandInput,
  requireAdminRoleEnvironment,
  revokeAdminRole,
} from './manageAdminRole'

const AUTH_PROVISIONING_TEST_LOCK = 754301

async function requireDatabaseOrSkip(t: { skip: (message: string) => void }) {
  try {
    await drizzleDb.execute(sql`select 1`)
    return true
  } catch {
    t.skip('PostgreSQL is not available for admin role command tests.')
    return false
  }
}

async function withPractitionerState<T>(run: (trackEmail: (email: string) => void) => Promise<T>) {
  return drizzleDb.transaction(async (lockTx) => {
    await lockTx.execute(sql`select pg_advisory_xact_lock(${AUTH_PROVISIONING_TEST_LOCK})`)
    const databaseId = demoPractitionerIds['prac-tom-cook']
    const [before] = await drizzleDb
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, databaseId))
      .limit(1)
    const createdEmails = new Set<string>()
    const trackEmail = (email: string) => createdEmails.add(email)

    await drizzleDb.update(practitioners).set({ userId: null }).where(eq(practitioners.id, databaseId))

    try {
      return await run(trackEmail)
    } finally {
      await drizzleDb
        .update(practitioners)
        .set({ userId: before?.userId ?? null })
        .where(eq(practitioners.id, databaseId))

      if (createdEmails.size > 0) {
        await drizzleDb.delete(users).where(inArray(users.email, [...createdEmails]))
      }
    }
  })
}

function buildEmail() {
  return `role-command-${randomUUID()}@example.test`
}

async function createUser(email: string) {
  await provisionAuthUser({
    email,
    name: 'Role Command User',
    password: 'StrongPassword123!',
    practitionerId: 'prac-tom-cook',
    allowRelink: false,
  })
}

test('grant-admin creates an admin role and is idempotent', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(async (trackEmail) => {
    const email = buildEmail()
    trackEmail(email)
    await createUser(email)

    const first = await grantAdminRole({ email, role: 'admin' })
    const second = await grantAdminRole({ email, role: 'admin' })
    const roles = await listUserRolesByEmail(email)

    assert.deepEqual(first, { email, role: 'admin', action: 'granted' })
    assert.deepEqual(second, { email, role: 'admin', action: 'granted' })
    assert.deepEqual(roles?.roles, ['admin'])
  })
})

test('revoke-admin removes admin role and is idempotent', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(async (trackEmail) => {
    const email = buildEmail()
    trackEmail(email)
    await createUser(email)
    await grantAdminRole({ email, role: 'admin' })

    const first = await revokeAdminRole({ email, role: 'admin' })
    const second = await revokeAdminRole({ email, role: 'admin' })
    const roles = await listUserRolesByEmail(email)

    assert.deepEqual(first, { email, role: 'admin', action: 'revoked' })
    assert.deepEqual(second, { email, role: 'admin', action: 'not-present' })
    assert.deepEqual(roles?.roles, [])
  })
})

test('admin role command rejects unknown users and missing env', async () => {
  assert.throws(
    () => readAdminRoleCommandInput('grant', { DATABASE_URL: 'postgres://localhost/test' } as unknown as NodeJS.ProcessEnv),
    /QICU_ADMIN_ROLE_EMAIL is required/,
  )
  assert.throws(
    () => requireAdminRoleEnvironment({} as NodeJS.ProcessEnv),
    /DATABASE_URL is required/,
  )
})

test('admin role command rejects unknown users', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await assert.rejects(
    () => grantAdminRole({ email: `missing-${randomUUID()}@example.test`, role: 'admin' }),
    /No user found/,
  )
})

test('admin role command output contains only safe public fields', () => {
  const lines: string[] = []
  printAdminRoleSummary(
    { email: 'operator@example.test', role: 'admin', action: 'granted' },
    { log: (line: string) => lines.push(line) },
  )
  const output = lines.join('\n')

  assert.equal(output.includes('operator@example.test'), true)
  assert.equal(output.includes('admin'), true)
  assert.equal(output.includes('password'), false)
  assert.equal(output.includes('session'), false)
})
