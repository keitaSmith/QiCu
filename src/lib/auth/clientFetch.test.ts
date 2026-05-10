import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPractitionerScopedFetchInit } from './clientFetch'

test('session scoped fetch options omit practitioner header and include credentials', () => {
  const init = buildPractitionerScopedFetchInit(
    { practitionerId: 'P-T-1001', source: 'session' },
    { headers: { 'Content-Type': 'application/json' } },
  )

  const headers = new Headers(init.headers)
  assert.equal(init.credentials, 'include')
  assert.equal(headers.get('Content-Type'), 'application/json')
  assert.equal(headers.get('x-qicu-practitioner-id'), null)
})

test('demo scoped fetch options preserve legacy practitioner header', () => {
  const init = buildPractitionerScopedFetchInit(
    { practitionerId: 'P-T-1002', source: 'demo' },
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  )

  const headers = new Headers(init.headers)
  assert.equal(init.credentials, 'include')
  assert.equal(init.method, 'POST')
  assert.equal(headers.get('Content-Type'), 'application/json')
  assert.equal(headers.get('x-qicu-practitioner-id'), 'P-T-1002')
})

test('explicit credentials option is preserved', () => {
  const init = buildPractitionerScopedFetchInit(
    { practitionerId: 'P-T-1001', source: 'session' },
    { credentials: 'same-origin' },
  )

  assert.equal(init.credentials, 'same-origin')
})
