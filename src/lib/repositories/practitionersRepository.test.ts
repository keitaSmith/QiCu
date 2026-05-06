import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getById,
  getByIdOrDefault,
  isKnownPractitioner,
  listPractitioners,
  normalizePractitionerId,
} from './practitionersRepository'

test('listPractitioners returns demo-compatible practitioner shapes', async () => {
  const practitioners = await listPractitioners()
  const tom = practitioners.find(practitioner => practitioner.id === 'prac-tom-cook')
  const keita = practitioners.find(practitioner => practitioner.id === 'prac-keita-smith')

  assert.ok(tom)
  assert.ok(keita)
  assert.equal(tom.name, 'Tom Cook')
  assert.equal(tom.email, 'tom.cook@qicu-demo.test')
  assert.equal(tom.initials, 'TC')
  assert.equal(typeof tom.avatarUrl, 'string')
  assert.equal(keita.name, 'Keita Smith')
  assert.equal(keita.icon, 'sparkles')
  assert.equal('displayName' in tom, false)
})

test('getById returns known practitioners and null for unknown ids', async () => {
  const tom = await getById('prac-tom-cook')

  assert.equal(tom?.id, 'prac-tom-cook')
  assert.equal(tom?.name, 'Tom Cook')
  assert.equal(await getById('unknown-practitioner'), null)
})

test('isKnownPractitioner and normalizePractitionerId preserve header fallback behavior', async () => {
  assert.equal(await isKnownPractitioner('prac-tom-cook'), true)
  assert.equal(await isKnownPractitioner('missing-practitioner'), false)
  assert.equal(await normalizePractitionerId('prac-keita-smith'), 'prac-keita-smith')
  assert.equal(await normalizePractitionerId('missing-practitioner'), 'prac-tom-cook')
  assert.equal(await getByIdOrDefault(null).then(practitioner => practitioner.id), 'prac-tom-cook')
})

