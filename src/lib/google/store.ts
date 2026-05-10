import type { GoogleIntegrationRecord } from '@/lib/google/types'

type PendingGoogleState = {
  practitionerId: string
  createdAt: number
  expiresAt: number
  consumedAt?: number
}

const googleIntegrationStore = new Map<string, GoogleIntegrationRecord>()
const pendingGoogleStates = new Map<string, PendingGoogleState>()
const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export function getGoogleIntegration(practitionerId: string): GoogleIntegrationRecord {
  return googleIntegrationStore.get(practitionerId) ?? {
    practitionerId,
    connected: false,
    lastError: null,
  }
}

export function saveGoogleIntegration(record: GoogleIntegrationRecord) {
  googleIntegrationStore.set(record.practitionerId, record)
  return record
}

export function disconnectGoogleIntegration(practitionerId: string) {
  googleIntegrationStore.delete(practitionerId)
}

export function createGoogleOAuthState(
  practitionerId: string,
  options: { now?: Date; ttlMs?: number } = {},
) {
  const createdAt = options.now?.getTime() ?? Date.now()
  const state = crypto.randomUUID()
  pendingGoogleStates.set(state, {
    practitionerId,
    createdAt,
    expiresAt: createdAt + (options.ttlMs ?? DEFAULT_OAUTH_STATE_TTL_MS),
  })
  return state
}

export function consumeGoogleOAuthState(
  state: string,
  options: { now?: Date } = {},
) {
  const value = pendingGoogleStates.get(state)
  pendingGoogleStates.delete(state)
  const now = options.now?.getTime() ?? Date.now()
  if (!value || value.consumedAt || value.expiresAt <= now) return undefined

  value.consumedAt = now
  return value
}
