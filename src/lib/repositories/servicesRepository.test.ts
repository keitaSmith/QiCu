import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { servicesStore } from '@/data/servicesStore'
import type { TrashMetadata } from '@/models/lifecycle'
import type { Service } from '@/models/service'
import {
  create,
  getById,
  listActiveByPractitioner,
  listGoogleImportCandidates,
  update,
} from './servicesRepository'

const practitionerId = 'prac-repo-service'
const otherPractitionerId = 'prac-repo-service-other'

function cleanup() {
  for (let index = servicesStore.length - 1; index >= 0; index -= 1) {
    if (
      servicesStore[index].id.startsWith('svc-repo-') ||
      servicesStore[index].practitionerId === practitionerId ||
      servicesStore[index].practitionerId === otherPractitionerId
    ) {
      servicesStore.splice(index, 1)
    }
  }
}

function service(input: Partial<Service> = {}): Service {
  return {
    id: input.id ?? `svc-repo-${Math.random().toString(36).slice(2, 8)}`,
    practitionerId: input.practitionerId ?? practitionerId,
    name: input.name ?? 'Repository Service',
    durationMinutes: input.durationMinutes ?? 45,
    description: input.description,
    active: input.active ?? true,
    trashMetadata: input.trashMetadata,
  }
}

function trashMetadata(): TrashMetadata {
  return {
    deletedAt: '2026-05-01T10:00:00.000Z',
    restoreUntil: '2026-05-31T10:00:00.000Z',
    deletedByPractitionerId: practitionerId,
    deletionGroupId: 'trash-repo-service',
    deletionType: 'service',
  }
}

afterEach(cleanup)

test('listActiveByPractitioner returns only scoped, active, non-trashed services', () => {
  cleanup()
  const active = service({ id: 'svc-repo-active' })
  const disabled = service({ id: 'svc-repo-disabled', active: false })
  const trashed = service({ id: 'svc-repo-trashed', trashMetadata: trashMetadata() })
  const other = service({ id: 'svc-repo-other', practitionerId: otherPractitionerId })
  servicesStore.push(active, disabled, trashed, other)

  const result = listActiveByPractitioner(practitionerId)

  assert.equal(result.some(item => item.id === active.id), true)
  assert.equal(result.some(item => item.id === disabled.id), false)
  assert.equal(result.some(item => item.id === trashed.id), false)
  assert.equal(result.some(item => item.id === other.id), false)
})

test('getById respects practitioner scope and trash state', () => {
  cleanup()
  const scoped = service({ id: 'svc-repo-get' })
  const trashed = service({ id: 'svc-repo-get-trashed', trashMetadata: trashMetadata() })
  servicesStore.push(scoped, trashed)

  assert.equal(getById(practitionerId, scoped.id)?.id, scoped.id)
  assert.equal(getById(otherPractitionerId, scoped.id), null)
  assert.equal(getById(practitionerId, trashed.id), null)
})

test('create assigns practitioner ownership', () => {
  cleanup()
  const created = create(practitionerId, {
    name: 'Repository Created Service',
    durationMinutes: 30,
    description: ' Created from test ',
  })

  assert.equal(created.practitionerId, practitionerId)
  assert.equal(created.name, 'Repository Created Service')
  assert.equal(created.durationMinutes, 30)
  assert.equal(created.description, 'Created from test')
  assert.equal(getById(practitionerId, created.id)?.id, created.id)
})

test('update respects practitioner scope', () => {
  cleanup()
  const existing = service({ id: 'svc-repo-update' })
  servicesStore.push(existing)

  assert.equal(update(otherPractitionerId, existing.id, { name: 'Wrong Scope' }), null)

  const updated = update(practitionerId, existing.id, {
    name: 'Updated Service',
    durationMinutes: 60,
    active: false,
  })

  assert.equal(updated?.id, existing.id)
  assert.equal(updated?.name, 'Updated Service')
  assert.equal(updated?.durationMinutes, 60)
  assert.equal(updated?.active, false)
})

test('listGoogleImportCandidates preserves practitioner-scoped preview candidates', () => {
  cleanup()
  const active = service({ id: 'svc-repo-google-active' })
  const trashed = service({ id: 'svc-repo-google-trashed', trashMetadata: trashMetadata() })
  const other = service({ id: 'svc-repo-google-other', practitionerId: otherPractitionerId })
  servicesStore.push(active, trashed, other)

  assert.deepEqual(
    listGoogleImportCandidates(practitionerId).map(item => item.id).sort(),
    [active.id, trashed.id].sort(),
  )
})
