import type { GoogleIntegrationRecord } from '@/lib/google/types'

type PendingGoogleState = {
  practitionerId: string
  createdAt: number
}

const googleIntegrationStore = new Map<string, GoogleIntegrationRecord>()
const pendingGoogleStates = new Map<string, PendingGoogleState>()

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

export function createGoogleOAuthState(practitionerId: string) {
  const state = crypto.randomUUID()
  pendingGoogleStates.set(state, {
    practitionerId,
    createdAt: Date.now(),
  })
  return state
}

export function consumeGoogleOAuthState(state: string) {
  const value = pendingGoogleStates.get(state)
  pendingGoogleStates.delete(state)
  return value
}
