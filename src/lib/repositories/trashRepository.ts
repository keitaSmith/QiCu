import { listTrash } from '@/lib/dataLifecycle'
import {
  buildTrashRecoveryView,
  filterTrashView,
  sortTrashView,
  type TrashSortOption,
  type TrashTypeFilter,
} from '@/lib/trashView'

type TrashRepositoryFilters = {
  query?: string
  type?: TrashTypeFilter
  sort?: TrashSortOption
}

export function listRawTrash(practitionerId: string) {
  return listTrash(practitionerId)
}

export function buildGroupedTrashView(practitionerId: string) {
  return buildTrashRecoveryView(listRawTrash(practitionerId))
}

export function listRecoveryView(
  practitionerId: string,
  filters: TrashRepositoryFilters = {},
) {
  const grouped = buildGroupedTrashView(practitionerId)
  const filtered = filterTrashView(grouped, {
    query: filters.query ?? '',
    type: filters.type ?? 'all',
  })
  return sortTrashView(filtered, filters.sort ?? 'deleted-desc')
}

export function getDeletionGroup(practitionerId: string, deletionGroupId: string) {
  const records = listRawTrash(practitionerId)
  return {
    patients: records.patients.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    bookings: records.bookings.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    sessions: records.sessions.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
    services: records.services.filter(item => item.trashMetadata?.deletionGroupId === deletionGroupId),
  }
}

