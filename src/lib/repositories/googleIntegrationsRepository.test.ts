import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
  consumeOAuthState,
  createOAuthState,
  disconnect,
  getIntegration,
  getSelectedCalendar,
  getStatus,
  saveIntegration,
  saveSelectedCalendar,
} from './googleIntegrationsRepository'

const practitionerId = 'prac-repo-google'
const otherPractitionerId = 'prac-repo-google-other'

afterEach(() => {
  disconnect(practitionerId)
  disconnect(otherPractitionerId)
})

test('getStatus returns disconnected public state when no integration exists', () => {
  const status = getStatus(practitionerId)

  assert.deepEqual(status, {
    connected: false,
    googleUserEmail: undefined,
    selectedCalendarId: undefined,
    selectedCalendarName: undefined,
    lastError: null,
  })
})

test('saveIntegration stores state scoped by practitioner and status hides tokens', () => {
  saveIntegration(practitionerId, {
    connected: true,
    googleUserEmail: 'repo@example.com',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    selectedCalendarId: 'calendar-1',
    selectedCalendarName: 'Clinic calendar',
    lastError: null,
  })

  const integration = getIntegration(practitionerId)
  assert.equal(integration.accessToken, 'fake-access-token')
  assert.equal(integration.refreshToken, 'fake-refresh-token')

  const status = getStatus(practitionerId)
  assert.equal(status.connected, true)
  assert.equal(status.googleUserEmail, 'repo@example.com')
  assert.equal('accessToken' in status, false)
  assert.equal('refreshToken' in status, false)

  assert.equal(getStatus(otherPractitionerId).connected, false)
})

test('saveSelectedCalendar stores calendar selection scoped by practitioner', () => {
  saveIntegration(practitionerId, {
    connected: true,
    accessToken: 'fake-access-token',
    lastError: null,
  })

  const updated = saveSelectedCalendar(practitionerId, {
    calendarId: 'calendar-selected',
    calendarName: 'Selected Calendar',
  })

  assert.equal(updated.selectedCalendarId, 'calendar-selected')
  assert.deepEqual(getSelectedCalendar(practitionerId), {
    id: 'calendar-selected',
    name: 'Selected Calendar',
  })
  assert.equal(getSelectedCalendar(otherPractitionerId), null)
})

test('disconnect clears only the scoped integration', () => {
  saveIntegration(practitionerId, { connected: true, accessToken: 'fake-access-token' })
  saveIntegration(otherPractitionerId, { connected: true, accessToken: 'other-fake-token' })

  disconnect(practitionerId)

  assert.equal(getStatus(practitionerId).connected, false)
  assert.equal(getStatus(otherPractitionerId).connected, true)
})

test('OAuth state creation and consume behavior remains one-time', () => {
  const state = createOAuthState(practitionerId)
  const consumed = consumeOAuthState(state)

  assert.equal(consumed?.practitionerId, practitionerId)
  assert.equal(typeof consumed?.createdAt, 'number')
  assert.equal(consumeOAuthState(state), undefined)
  assert.equal(consumeOAuthState('missing-state'), undefined)
})

