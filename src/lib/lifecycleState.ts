import type { LifecycleFields } from '@/models/lifecycle'

type LifecycleRecord = LifecycleFields & { active?: boolean }

export function isTrashed(record: LifecycleFields | null | undefined) {
  return Boolean(record?.trashMetadata)
}

export function isArchived(record: LifecycleRecord | null | undefined) {
  return !isTrashed(record) && record?.active === false
}

export function isActiveRecord(record: LifecycleRecord | null | undefined) {
  return Boolean(record) && !isTrashed(record) && !isArchived(record)
}

