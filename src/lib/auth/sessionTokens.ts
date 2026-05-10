import { createHash, randomBytes } from 'node:crypto'

export const SESSION_TOKEN_BYTES = 32
export const SESSION_DURATION_DAYS = 14

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

export function hashSessionToken(token: string): string {
  if (!token) throw new Error('Session token is required.')
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

export function createSessionExpiryDate(now = new Date()): Date {
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)
  return expiresAt
}
