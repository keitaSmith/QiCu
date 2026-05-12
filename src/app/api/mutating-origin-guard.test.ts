import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NextRequest } from 'next/server'

import { GET as GET_BOOKINGS, POST as POST_BOOKINGS } from './bookings/route'
import { POST as POST_GOOGLE_DISCONNECT } from './integrations/google/disconnect/route'
import { POST as POST_GOOGLE_RECONCILE } from './integrations/google/reconcile/route'
import { POST as POST_PATIENT_ARCHIVE } from './patients/[patientId]/archive/route'
import { POST as POST_SERVICE } from './services/route'
import { PATCH as PATCH_SESSION } from './sessions/[sessionId]/route'
import { POST as POST_TRASH_RESTORE } from './trash/[deletionGroupId]/restore/route'

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost:3000${path}`, init)
}

function crossOriginPost(path: string, body: Record<string, unknown> = {}) {
  return request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example.test',
    },
    body: JSON.stringify(body),
  })
}

async function expectForbidden(response: Response) {
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'Forbidden' })
}

test('representative mutating API routes reject clearly cross-origin requests', async () => {
  const cases: Array<Promise<Response>> = [
    POST_BOOKINGS(crossOriginPost('/api/bookings')),
    POST_PATIENT_ARCHIVE(crossOriginPost('/api/patients/P-T-1001/archive'), {
      params: Promise.resolve({ patientId: 'P-T-1001' }),
    }),
    POST_SERVICE(crossOriginPost('/api/services')),
    PATCH_SESSION(
      request('/api/sessions/S-T-1001', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example.test',
        },
        body: JSON.stringify({ treatmentSummary: 'Blocked by origin guard' }),
      }),
      { params: Promise.resolve({ sessionId: 'S-T-1001' }) },
    ),
    POST_TRASH_RESTORE(crossOriginPost('/api/trash/group-1/restore'), {
      params: Promise.resolve({ deletionGroupId: 'group-1' }),
    }),
    POST_GOOGLE_DISCONNECT(crossOriginPost('/api/integrations/google/disconnect')),
    POST_GOOGLE_RECONCILE(crossOriginPost('/api/integrations/google/reconcile')),
  ]

  for (const response of await Promise.all(cases)) {
    await expectForbidden(response)
  }
})

test('same-origin mutating request reaches existing domain validation', async () => {
  const response = await POST_BOOKINGS(
    request('/api/bookings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({}),
    }),
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'patientId is required' })
})

test('read-only GET routes are not blocked by the mutating origin guard', async () => {
  const response = await GET_BOOKINGS(
    request('/api/bookings', {
      method: 'GET',
      headers: { origin: 'https://evil.example.test' },
    }),
  )

  assert.notEqual(response.status, 403)
})
