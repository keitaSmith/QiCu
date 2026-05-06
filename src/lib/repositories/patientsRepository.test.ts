import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { patientsStore } from '@/data/patientsStore'
import { setPatientPractitionerId } from '@/lib/practitioners'
import type { TrashMetadata } from '@/models/lifecycle'
import type { FhirPatient } from '@/models/patient'
import {
  create,
  getById,
  listActiveByPractitioner,
  listGoogleImportCandidates,
  update,
} from './patientsRepository'

const practitionerId = 'prac-repo-patient'
const otherPractitionerId = 'prac-repo-patient-other'

function cleanup() {
  for (let index = patientsStore.length - 1; index >= 0; index -= 1) {
    if (patientsStore[index].id.startsWith('P-REPO-')) patientsStore.splice(index, 1)
  }
}

function patient(id: string, owner = practitionerId, active = true): FhirPatient {
  return setPatientPractitionerId(
    {
      resourceType: 'Patient',
      id,
      active,
      name: [{ text: id, family: id, given: [id] }],
    },
    owner,
  )
}

function trashMetadata(): TrashMetadata {
  return {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: practitionerId,
    deletionGroupId: 'trash-repo-patient',
    deletionType: 'patient-data',
  }
}

afterEach(cleanup)

test('listActiveByPractitioner returns only scoped, active, non-trashed patients', async () => {
  cleanup()
  const active = patient('P-REPO-active')
  const archived = patient('P-REPO-archived', practitionerId, false)
  const trashed = patient('P-REPO-trashed')
  const other = patient('P-REPO-other', otherPractitionerId)
  trashed.trashMetadata = trashMetadata()
  patientsStore.push(active, archived, trashed, other)

  const result = await listActiveByPractitioner(practitionerId)

  assert.equal(result.some(item => item.id === active.id), true)
  assert.equal(result.some(item => item.id === archived.id), false)
  assert.equal(result.some(item => item.id === trashed.id), false)
  assert.equal(result.some(item => item.id === other.id), false)
})

test('getById respects practitioner scope and trash state', async () => {
  cleanup()
  const scoped = patient('P-REPO-get')
  const trashed = patient('P-REPO-get-trashed')
  trashed.trashMetadata = trashMetadata()
  patientsStore.push(scoped, trashed)

  assert.equal((await getById(practitionerId, scoped.id))?.id, scoped.id)
  assert.equal(await getById(otherPractitionerId, scoped.id), null)
  assert.equal(await getById(practitionerId, trashed.id), null)
})

test('create assigns practitioner ownership without changing the input id', async () => {
  cleanup()
  const created = await create(otherPractitionerId, patient('P-REPO-create', practitionerId))

  assert.equal(created.id, 'P-REPO-create')
  assert.equal((await getById(otherPractitionerId, created.id))?.id, created.id)
  assert.equal(await getById(practitionerId, created.id), null)
})

test('update respects practitioner scope and preserves patient id', async () => {
  cleanup()
  const existing = patient('P-REPO-update')
  patientsStore.push(existing)

  assert.equal(await update(otherPractitionerId, existing.id, { active: false }), null)

  const updated = await update(practitionerId, existing.id, {
    active: false,
    name: [{ text: 'Updated Patient', family: 'Patient', given: ['Updated'] }],
  })

  assert.equal(updated?.id, existing.id)
  assert.equal(updated?.active, false)
  assert.equal(updated?.name[0].text, 'Updated Patient')
})

test('listGoogleImportCandidates preserves practitioner-scoped preview candidates', async () => {
  cleanup()
  const active = patient('P-REPO-google-active')
  const trashed = patient('P-REPO-google-trashed')
  const other = patient('P-REPO-google-other', otherPractitionerId)
  trashed.trashMetadata = trashMetadata()
  patientsStore.push(active, trashed, other)

  assert.deepEqual(
    (await listGoogleImportCandidates(practitionerId)).map(item => item.id).sort(),
    [active.id, trashed.id].sort(),
  )
})

test('seeded DB patients keep public IDs and FHIR-like shape when available', async () => {
  const active = await listActiveByPractitioner('prac-tom-cook')
  const alice = await getById('prac-tom-cook', 'P-T-1001')

  assert.equal(active.some(item => item.id === 'P-T-1001'), true)
  assert.equal(active.some(item => /^[0-9a-f-]{36}$/i.test(item.id)), false)
  assert.equal(alice?.resourceType, 'Patient')
  assert.equal(alice?.id, 'P-T-1001')
  assert.equal(alice?.extension?.some(item => item.valueString === 'prac-tom-cook'), true)
  assert.equal(await getById('prac-keita-smith', 'P-T-1001'), null)
})

test('repeated DB-backed patient reads do not duplicate runtime mirror rows', async () => {
  const before = patientsStore.filter(item => item.id === 'P-T-1001').length

  await getById('prac-tom-cook', 'P-T-1001')
  await getById('prac-tom-cook', 'P-T-1001')
  await listActiveByPractitioner('prac-tom-cook')

  const after = patientsStore.filter(item => item.id === 'P-T-1001').length
  assert.equal(after, before)
})
