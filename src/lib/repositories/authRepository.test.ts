import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { afterEach, test } from 'node:test'

import { eq } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { authSessions, passwordCredentials, users } from '@/db/schema'
import { hashPassword } from '@/lib/auth/password'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import {
  createAuthSession,
  createPasswordCredential,
  getValidAuthSessionByTokenHash,
  revokeAuthSession,
} from './authRepository'

const createdUserIds = new Set<string>()

async function createTestUser() {
  const id = randomUUID()
  try {
    const rows = await drizzleDb
      .insert(users)
      .values({
        id,
        email: `auth-${id}@example.test`,
        name: 'Auth Test User',
        authProvider: 'password',
        authProviderUserId: `auth-${id}`,
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
      // Test cleanup should not mask the original assertion.
    }
  }
  createdUserIds.clear()
})

test('auth repository creates password credentials without plaintext passwords', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const plaintext = 'test password that is long enough'
  const password = await hashPassword(plaintext)
  const credential = await createPasswordCredential(setup.user.id, password.hash, password.algorithm)

  assert.ok(credential)
  assert.equal(credential.userId, setup.user.id)
  assert.equal(credential.passwordAlgorithm, password.algorithm)
  assert.notEqual(credential.passwordHash, plaintext)
  assert.equal(credential.passwordHash.includes(plaintext), false)

  const rows = await drizzleDb
    .select()
    .from(passwordCredentials)
    .where(eq(passwordCredentials.userId, setup.user.id))

  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].passwordHash, plaintext)
})

test('auth repository creates and reads a valid hashed-token session', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const token = generateSessionToken()
  const tokenHash = hashSessionToken(token)
  const session = await createAuthSession(setup.user.id, tokenHash, createSessionExpiryDate(), {
    userAgent: 'node-test',
    ipHash: hashSessionToken('127.0.0.1'),
  })
  const loaded = await getValidAuthSessionByTokenHash(tokenHash)

  assert.ok(session)
  assert.ok(loaded)
  assert.equal(loaded.id, session.id)
  assert.equal(loaded.sessionTokenHash, tokenHash)
  assert.notEqual(loaded.sessionTokenHash, token)

  const rows = await drizzleDb.select().from(authSessions).where(eq(authSessions.id, session.id))
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].sessionTokenHash, token)
})

test('expired and revoked sessions are not considered valid', async t => {
  const setup = await createTestUser()
  if (!setup.available || !setup.user) {
    t.skip('PostgreSQL auth tables are not available for this test run.')
    return
  }

  const expiredHash = hashSessionToken(generateSessionToken())
  const validHash = hashSessionToken(generateSessionToken())

  await createAuthSession(setup.user.id, expiredHash, new Date(Date.now() - 60_000))
  await createAuthSession(setup.user.id, validHash, createSessionExpiryDate())

  assert.equal(await getValidAuthSessionByTokenHash(expiredHash), null)
  assert.ok(await getValidAuthSessionByTokenHash(validHash))

  await revokeAuthSession(validHash)
  assert.equal(await getValidAuthSessionByTokenHash(validHash), null)
})
