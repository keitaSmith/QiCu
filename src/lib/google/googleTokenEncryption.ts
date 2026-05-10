import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ENV_KEY = 'GOOGLE_TOKEN_ENCRYPTION_KEY'
const PAYLOAD_VERSION = 'qicu-google-token-v1'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64')
}

function getEncryptionKey() {
  const rawKey = process.env[ENV_KEY]?.trim()
  if (!rawKey) {
    throw new Error(`${ENV_KEY} is required before Google tokens can be encrypted.`)
  }

  const key = decodeBase64Url(rawKey)
  if (key.length !== KEY_BYTES) {
    throw new Error(`${ENV_KEY} must decode to exactly 32 bytes for AES-256-GCM.`)
  }

  return key
}

export function hasGoogleTokenEncryptionConfig() {
  try {
    getEncryptionKey()
    return true
  } catch {
    return false
  }
}

export function assertGoogleTokenEncryptionConfig() {
  getEncryptionKey()
}

export function encryptGoogleToken(plaintext: string) {
  if (!plaintext) {
    throw new Error('Google token plaintext must not be empty.')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    PAYLOAD_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

export function decryptGoogleToken(ciphertextPayload: string) {
  const [version, ivEncoded, authTagEncoded, ciphertextEncoded, extra] =
    ciphertextPayload.split('.')

  if (
    version !== PAYLOAD_VERSION ||
    !ivEncoded ||
    !authTagEncoded ||
    !ciphertextEncoded ||
    extra !== undefined
  ) {
    throw new Error('Google token ciphertext payload is malformed.')
  }

  try {
    const key = getEncryptionKey()
    const iv = Buffer.from(ivEncoded, 'base64url')
    const authTag = Buffer.from(authTagEncoded, 'base64url')
    const ciphertext = Buffer.from(ciphertextEncoded, 'base64url')

    if (iv.length !== IV_BYTES || authTag.length === 0 || ciphertext.length === 0) {
      throw new Error('Invalid encrypted Google token payload.')
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return plaintext.toString('utf8')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${ENV_KEY} `)) {
      throw error
    }
    throw new Error('Google token ciphertext payload could not be decrypted.')
  }
}
