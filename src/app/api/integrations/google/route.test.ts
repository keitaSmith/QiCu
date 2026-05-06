import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { NextRequest } from 'next/server'

import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'
import { POST as SELECT_CALENDAR } from './calendar-selection/route'
import { POST as DISCONNECT } from './disconnect/route'
import { GET as STATUS } from './status/route'

const practitionerId = 'prac-tom-cook'

type TestRequestInit = {
  method?: string
  headers?: HeadersInit
  body?: BodyInit | null
}

function request(path: string, init: TestRequestInit = {}) {
  const requestInit = {
    method: init.method,
    body: init.body,
    headers: {
      'x-qicu-practitioner-id': practitionerId,
      ...(init.headers ?? {}),
    },
  }

  return new NextRequest(`http://localhost:3000${path}`, requestInit)
}

afterEach(() => {
  googleIntegrationsRepository.disconnect(practitionerId)
})

test('Google status route returns public state without tokens', async () => {
  googleIntegrationsRepository.saveIntegration(practitionerId, {
    connected: true,
    googleUserEmail: 'route@example.com',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    selectedCalendarId: 'calendar-route',
    selectedCalendarName: 'Route Calendar',
    lastError: null,
  })

  const response = await STATUS(request('/api/integrations/google/status'))
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.connected, true)
  assert.equal(payload.googleUserEmail, 'route@example.com')
  assert.equal(payload.selectedCalendarId, 'calendar-route')
  assert.equal(payload.accessToken, undefined)
  assert.equal(payload.refreshToken, undefined)
})

test('Google calendar selection route preserves connected checks and response shape', async () => {
  const disconnectedResponse = await SELECT_CALENDAR(
    request('/api/integrations/google/calendar-selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ calendarId: 'calendar-route' }),
    }),
  )
  assert.equal(disconnectedResponse.status, 400)
  assert.deepEqual(await disconnectedResponse.json(), {
    error: 'Google Calendar is not connected',
  })

  googleIntegrationsRepository.saveIntegration(practitionerId, {
    connected: true,
    accessToken: 'fake-access-token',
    lastError: null,
  })

  const response = await SELECT_CALENDAR(
    request('/api/integrations/google/calendar-selection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        calendarId: 'calendar-route',
        calendarName: 'Route Calendar',
      }),
    }),
  )
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.connected, true)
  assert.equal(payload.selectedCalendarId, 'calendar-route')
  assert.equal(payload.selectedCalendarName, 'Route Calendar')
})

test('Google disconnect route clears scoped integration', async () => {
  googleIntegrationsRepository.saveIntegration(practitionerId, {
    connected: true,
    accessToken: 'fake-access-token',
  })

  const response = await DISCONNECT(
    request('/api/integrations/google/disconnect', { method: 'POST' }),
  )

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(googleIntegrationsRepository.getStatus(practitionerId).connected, false)
})
