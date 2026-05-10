import assert from 'node:assert/strict'
import test from 'node:test'

import { hashPassword, MIN_PASSWORD_LENGTH, PASSWORD_ALGORITHM, verifyPassword } from './password'

test('password hashing returns a non-plaintext hash', async () => {
  const password = 'correct horse battery staple'
  const result = await hashPassword(password)

  assert.equal(result.algorithm, PASSWORD_ALGORITHM)
  assert.notEqual(result.hash, password)
  assert.equal(result.hash.includes(password), false)
})

test('password verification succeeds for the right password', async () => {
  const password = 'another secure test password'
  const result = await hashPassword(password)

  assert.equal(await verifyPassword(password, result.hash, result.algorithm), true)
})

test('password verification fails for the wrong password', async () => {
  const result = await hashPassword('the real test password')

  assert.equal(await verifyPassword('the wrong test password', result.hash, result.algorithm), false)
})

test('empty and too-short passwords are rejected', async () => {
  await assert.rejects(() => hashPassword(''), /at least/)
  await assert.rejects(() => hashPassword('x'.repeat(MIN_PASSWORD_LENGTH - 1)), /at least/)
})

test('unsupported password algorithms are rejected', async () => {
  await assert.rejects(() => verifyPassword('password', 'hash', 'plaintext'), /Unsupported/)
})
