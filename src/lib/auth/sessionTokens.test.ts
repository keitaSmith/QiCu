import assert from 'node:assert/strict'
import test from 'node:test'

import { createSessionExpiryDate, generateSessionToken, hashSessionToken, SESSION_TOKEN_BYTES } from './sessionTokens'

test('session token generation creates different high-entropy tokens', () => {
  const first = generateSessionToken()
  const second = generateSessionToken()

  assert.notEqual(first, second)
  assert.ok(first.length >= SESSION_TOKEN_BYTES)
  assert.ok(second.length >= SESSION_TOKEN_BYTES)
})

test('session token hash is deterministic and not plaintext', () => {
  const token = 'test-session-token'
  const first = hashSessionToken(token)
  const second = hashSessionToken(token)

  assert.equal(first, second)
  assert.notEqual(first, token)
  assert.equal(first.includes(token), false)
})

test('empty session tokens are rejected before hashing', () => {
  assert.throws(() => hashSessionToken(''), /required/)
})

test('session expiry is in the future', () => {
  const now = new Date('2026-05-10T12:00:00.000Z')
  const expiresAt = createSessionExpiryDate(now)

  assert.ok(expiresAt.getTime() > now.getTime())
})
