import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { afterEach, test } from 'node:test'

import {
  assertGoogleTokenEncryptionConfig,
  decryptGoogleToken,
  encryptGoogleToken,
  hasGoogleTokenEncryptionConfig,
} from './googleTokenEncryption'

const originalKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

function setTestKey() {
  const key = randomBytes(32).toString('base64url')
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = key
  return key
}

function tamperPayload(payload: string) {
  const parts = payload.split('.')
  const ciphertext = parts[3]
  parts[3] = `${ciphertext.slice(0, -1)}${ciphertext.endsWith('A') ? 'B' : 'A'}`
  return parts.join('.')
}

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  } else {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = originalKey
  }
})

test('encrypt/decrypt round trip returns the original token', () => {
  setTestKey()
  const token = 'ya29.fake-access-token-for-encryption-test'

  const encrypted = encryptGoogleToken(token)
  const decrypted = decryptGoogleToken(encrypted)

  assert.equal(decrypted, token)
})

test('encrypting the same plaintext twice produces different ciphertext payloads', () => {
  setTestKey()
  const token = 'same-token-value'

  const first = encryptGoogleToken(token)
  const second = encryptGoogleToken(token)

  assert.notEqual(first, second)
  assert.equal(decryptGoogleToken(first), token)
  assert.equal(decryptGoogleToken(second), token)
})

test('ciphertext payload does not contain the plaintext token', () => {
  setTestKey()
  const token = 'plain-google-token-value'

  const encrypted = encryptGoogleToken(token)

  assert.equal(encrypted.includes(token), false)
})

test('decrypt rejects malformed payloads', () => {
  setTestKey()

  assert.throws(
    () => decryptGoogleToken('not-a-valid-google-token-payload'),
    /malformed/,
  )
})

test('decrypt rejects tampered payloads', () => {
  setTestKey()
  const encrypted = encryptGoogleToken('token-to-tamper')

  assert.throws(
    () => decryptGoogleToken(tamperPayload(encrypted)),
    /could not be decrypted/,
  )
})

test('missing key/config causes a clear error', () => {
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY

  assert.equal(hasGoogleTokenEncryptionConfig(), false)
  assert.throws(
    () => assertGoogleTokenEncryptionConfig(),
    /GOOGLE_TOKEN_ENCRYPTION_KEY is required/,
  )
  assert.throws(
    () => encryptGoogleToken('token-without-key'),
    /GOOGLE_TOKEN_ENCRYPTION_KEY is required/,
  )
})

test('invalid key length causes a clear error', () => {
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(16).toString('base64url')

  assert.equal(hasGoogleTokenEncryptionConfig(), false)
  assert.throws(
    () => assertGoogleTokenEncryptionConfig(),
    /must decode to exactly 32 bytes/,
  )
})

test('empty plaintext is rejected', () => {
  setTestKey()

  assert.throws(
    () => encryptGoogleToken(''),
    /must not be empty/,
  )
})
