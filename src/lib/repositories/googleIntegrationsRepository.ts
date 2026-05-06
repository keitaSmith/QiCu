import {
  consumeGoogleOAuthState,
  createGoogleOAuthState,
  disconnectGoogleIntegration,
  getGoogleIntegration,
  saveGoogleIntegration,
} from '@/lib/google/store'
import type { GoogleIntegrationRecord } from '@/lib/google/types'

export type GoogleIntegrationStatus = {
  connected: boolean
  googleUserEmail?: string
  selectedCalendarId?: string
  selectedCalendarName?: string
  lastError: string | null
}

export function getIntegration(practitionerId: string) {
  return getGoogleIntegration(practitionerId)
}

export function getStatus(practitionerId: string): GoogleIntegrationStatus {
  const integration = getIntegration(practitionerId)

  return {
    connected: integration.connected,
    googleUserEmail: integration.googleUserEmail,
    selectedCalendarId: integration.selectedCalendarId,
    selectedCalendarName: integration.selectedCalendarName,
    lastError: integration.lastError ?? null,
  }
}

export function saveIntegration(
  practitionerId: string,
  input: Omit<GoogleIntegrationRecord, 'practitionerId'> & {
    practitionerId?: string
  },
) {
  return saveGoogleIntegration({
    ...input,
    practitionerId,
  })
}

export function saveSelectedCalendar(
  practitionerId: string,
  input: { calendarId: string; calendarName?: string },
) {
  const integration = getIntegration(practitionerId)
  return saveIntegration(practitionerId, {
    ...integration,
    connected: true,
    selectedCalendarId: input.calendarId,
    selectedCalendarName: input.calendarName?.trim() || input.calendarId,
  })
}

export function getSelectedCalendar(practitionerId: string) {
  const integration = getIntegration(practitionerId)
  if (!integration.selectedCalendarId) return null

  return {
    id: integration.selectedCalendarId,
    name: integration.selectedCalendarName ?? integration.selectedCalendarId,
  }
}

export function disconnect(practitionerId: string) {
  disconnectGoogleIntegration(practitionerId)
}

export function createOAuthState(practitionerId: string) {
  return createGoogleOAuthState(practitionerId)
}

export function consumeOAuthState(state: string) {
  return consumeGoogleOAuthState(state)
}

