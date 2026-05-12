import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NextRequest } from 'next/server'

import {
  isClearlyCrossSiteRequest,
  isSameOriginRequest,
  mutatingOriginGuardResponse,
} from './originGuard'

test('same-origin requests are allowed', () => {
  const request = new NextRequest('http://localhost:3000/api/bookings', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  })

  assert.equal(isSameOriginRequest(request), true)
  assert.equal(isClearlyCrossSiteRequest(request), false)
  assert.equal(mutatingOriginGuardResponse(request), null)
})

test('clearly cross-origin mutating requests are rejected', async () => {
  const request = new NextRequest('http://localhost:3000/api/bookings', {
    method: 'POST',
    headers: { origin: 'https://evil.example.test' },
  })

  const response = mutatingOriginGuardResponse(request)

  assert.equal(isSameOriginRequest(request), false)
  assert.equal(isClearlyCrossSiteRequest(request), true)
  assert.equal(response?.status, 403)
  assert.deepEqual(await response?.json(), { error: 'Forbidden' })
})

test('missing Origin remains compatible for non-browser clients', () => {
  const request = new NextRequest('http://localhost:3000/api/bookings', {
    method: 'POST',
  })

  assert.equal(isSameOriginRequest(request), true)
  assert.equal(isClearlyCrossSiteRequest(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv), false)
  assert.equal(mutatingOriginGuardResponse(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv), null)
})

test('strict production rejects browser fetch metadata that is clearly cross-site without Origin', async () => {
  const request = new NextRequest('http://localhost:3000/api/bookings', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site' },
  })

  const response = mutatingOriginGuardResponse(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv)

  assert.equal(isClearlyCrossSiteRequest(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv), true)
  assert.equal(response?.status, 403)
  assert.deepEqual(await response?.json(), { error: 'Forbidden' })
})
