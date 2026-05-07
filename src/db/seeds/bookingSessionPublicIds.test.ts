import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoBookings } from './demoBookings'
import { demoSessions } from './demoSessions'
import { demoBookingIds, demoSessionIds } from './ids'

function uniqueScopedKeys(rows: Array<{ practitionerId: string; publicId?: string | null }>) {
  return new Set(rows.map(row => `${row.practitionerId}:${row.publicId}`))
}

test('demo booking seed rows include current public IDs', () => {
  const expectedPublicIds = Object.keys(demoBookingIds).sort()
  const actualPublicIds = demoBookings.map(row => row.publicId).sort()

  assert.deepEqual(actualPublicIds, expectedPublicIds)
  assert.equal(demoBookings.every(row => String(row.publicId) !== String(row.id)), true)
  assert.equal(uniqueScopedKeys(demoBookings).size, demoBookings.length)
})

test('demo session seed rows include current public IDs', () => {
  const expectedPublicIds = Object.keys(demoSessionIds).sort()
  const actualPublicIds = demoSessions.map(row => row.publicId).sort()

  assert.deepEqual(actualPublicIds, expectedPublicIds)
  assert.equal(demoSessions.every(row => String(row.publicId) !== String(row.id)), true)
  assert.equal(uniqueScopedKeys(demoSessions).size, demoSessions.length)
})

test('booking/session seeds preserve canonical relationship shape', () => {
  assert.equal(demoBookings.some(row => 'sessionId' in row), false)

  const linkedSession = demoSessions.find(row => row.publicId === 'S-T-1001')
  const walkInSession = demoSessions.find(row => row.publicId === 'S-K-2001')

  assert.equal(linkedSession?.bookingId, demoBookingIds['b-tom-past-201'])
  assert.equal(walkInSession?.bookingId, null)
})
