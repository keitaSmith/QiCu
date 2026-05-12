import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { eq, inArray, sql } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { passwordCredentials, practitioners, users } from '@/db/schema'
import { verifyPassword } from '@/lib/auth/password'
import { demoPractitionerIds } from '@/db/seeds/ids'
import {
  printProvisionedAuthUserSummary,
  provisionAuthUser,
  readCreateUserInput,
  requireCreateUserEnvironment,
} from './createUser'

const AUTH_PROVISIONING_TEST_LOCK = 754301

async function requireDatabaseOrSkip(t: { skip: (message: string) => void }) {
  try {
    await drizzleDb.execute(sql`select 1`)
    return true
  } catch {
    t.skip('PostgreSQL is not available for admin auth provisioning tests.')
    return false
  }
}

async function withPractitionerState<T>(
  publicIds: Array<keyof typeof demoPractitionerIds>,
  run: (trackEmail: (email: string) => void) => Promise<T>,
) {
  return drizzleDb.transaction(async (lockTx) => {
    await lockTx.execute(sql`select pg_advisory_xact_lock(${AUTH_PROVISIONING_TEST_LOCK})`)
    const databaseIds = publicIds.map((publicId) => demoPractitionerIds[publicId])
    const before = await drizzleDb
      .select()
      .from(practitioners)
      .where(inArray(practitioners.id, databaseIds))

    const originalUserIds = new Map(before.map((row) => [row.id, row.userId]))
    const createdEmails = new Set<string>()
    const trackEmail = (email: string) => {
      createdEmails.add(email)
    }

    await drizzleDb
      .update(practitioners)
      .set({ userId: null })
      .where(inArray(practitioners.id, databaseIds))

    try {
      return await run(trackEmail)
    } finally {
      for (const databaseId of databaseIds) {
        await drizzleDb
          .update(practitioners)
          .set({ userId: originalUserIds.get(databaseId) ?? null })
          .where(eq(practitioners.id, databaseId))
      }

      if (createdEmails.size > 0) {
        await drizzleDb.delete(users).where(inArray(users.email, [...createdEmails]))
      }
    }
  })
}

function buildInput(overrides: Partial<Parameters<typeof provisionAuthUser>[0]> = {}) {
  const token = randomUUID()
  return {
    email: `operator-${token}@example.test`,
    password: 'StrongPassword123!',
    name: `Operator ${token.slice(0, 8)}`,
    practitionerId: 'prac-tom-cook',
    allowRelink: false,
    ...overrides,
  }
}

test('create user provisions a hashed password credential and links the practitioner', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook'], async (trackEmail) => {
    const input = buildInput()
    const result = await provisionAuthUser(input)
    trackEmail(input.email)

    const [user] = await drizzleDb.select().from(users).where(eq(users.email, input.email)).limit(1)
    assert.ok(user)
    const [credential] = await drizzleDb
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, user.id))
      .limit(1)
    const [practitioner] = await drizzleDb
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, demoPractitionerIds['prac-tom-cook']))
      .limit(1)

    assert.deepEqual(result, {
      email: input.email,
      name: input.name,
      practitionerId: 'prac-tom-cook',
      practitionerName: practitioner?.displayName ?? 'Tom Cook',
    })
    assert.ok(credential)
    assert.notEqual(credential.passwordHash, input.password)
    assert.equal(await verifyPassword(input.password, credential.passwordHash, credential.passwordAlgorithm), true)
    assert.equal(practitioner?.userId, user.id)
  })
})

test('provisioning is idempotent for the same email and practitioner', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook'], async (trackEmail) => {
    const input = buildInput()
    const first = await provisionAuthUser(input)
    const second = await provisionAuthUser({ ...input, name: 'Updated Name' })
    trackEmail(input.email)

    const rows = await drizzleDb.select().from(users).where(eq(users.email, input.email))
    assert.equal(rows.length, 1)
    assert.equal(first.email, second.email)
  })
})

test('unknown practitioner public IDs are rejected', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  const input = buildInput({ practitionerId: 'missing-practitioner' })
  await assert.rejects(
    () => provisionAuthUser(input),
    /Unknown practitioner public ID: missing-practitioner/,
  )
})

test('missing environment variables are rejected before provisioning', () => {
  assert.throws(
    () => readCreateUserInput({ DATABASE_URL: 'postgres://localhost/test' } as unknown as NodeJS.ProcessEnv),
    /Missing required environment variables:/,
  )

  assert.throws(
    () => requireCreateUserEnvironment({} as unknown as NodeJS.ProcessEnv),
    /DATABASE_URL is required to run auth:create-user/,
  )
})

test('weak passwords are rejected by the existing password helper validation', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook'], async () => {
    const input = buildInput({ password: 'too-short' })
    await assert.rejects(
      () => provisionAuthUser(input),
      /Password must be at least 12 characters\./,
    )
  })
})

test('relinking is rejected by default and requires explicit override', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook', 'prac-keita-smith'], async (trackEmail) => {
    const firstUser = buildInput({ practitionerId: 'prac-tom-cook' })
    const secondUser = buildInput({ practitionerId: 'prac-keita-smith' })
    trackEmail(firstUser.email)
    trackEmail(secondUser.email)

    await provisionAuthUser(firstUser)
    await provisionAuthUser(secondUser)

    await assert.rejects(
      () => provisionAuthUser({ ...firstUser, practitionerId: 'prac-keita-smith' }),
      /already linked to practitioner/i,
    )

    await assert.rejects(
      () => provisionAuthUser({ ...buildInput(), practitionerId: 'prac-tom-cook' }),
      /already linked to another user/i,
    )

    const moved = await provisionAuthUser({
      ...firstUser,
      practitionerId: 'prac-keita-smith',
      allowRelink: true,
    })

    const [user] = await drizzleDb.select().from(users).where(eq(users.email, firstUser.email)).limit(1)
    const [tom] = await drizzleDb
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, demoPractitionerIds['prac-tom-cook']))
      .limit(1)
    const [keita] = await drizzleDb
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, demoPractitionerIds['prac-keita-smith']))
      .limit(1)

    assert.equal(moved.practitionerId, 'prac-keita-smith')
    assert.equal(tom?.userId, null)
    assert.equal(keita?.userId, user?.id)
  })
})

test('summary output includes only safe public fields', async (t) => {
  if (!(await requireDatabaseOrSkip(t))) return

  await withPractitionerState(['prac-tom-cook'], async (trackEmail) => {
    const input = buildInput()
    const result = await provisionAuthUser(input)
    trackEmail(input.email)
    const [user] = await drizzleDb.select().from(users).where(eq(users.email, input.email)).limit(1)
    const lines: string[] = []

    printProvisionedAuthUserSummary(result, {
      log: (line: string) => {
        lines.push(line)
      },
    })

    const output = lines.join('\n')
    assert.equal(output.includes(input.password), false)
    assert.equal(output.includes(user?.id ?? ''), false)
    assert.equal(output.includes('password_hash'), false)
    assert.equal(output.includes('password'), false)
  })
})
