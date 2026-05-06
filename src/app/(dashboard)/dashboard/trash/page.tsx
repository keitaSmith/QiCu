'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FilterSelect, type FilterOption } from '@/components/ui/FilterSelect'
import { SearchField } from '@/components/ui/SearchField'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { useSnackbar } from '@/components/ui/Snackbar'
import { withPractitionerHeaders } from '@/lib/practitioners'
import { dateFmt } from '@/lib/dates'
import {
  buildTrashRecoveryView,
  filterTrashView,
  sortTrashView,
  trashSortOptions,
  type TrashIndividualRecord,
  type TrashPayload,
  type TrashPatientGroup,
  type TrashSortOption,
  type TrashTypeFilter,
} from '@/lib/trashView'

type RestoreTarget =
  | { kind: 'patient-group'; item: TrashPatientGroup }
  | { kind: 'individual'; item: TrashIndividualRecord }

const typeOptions: FilterOption<TrashTypeFilter>[] = [
  { value: 'all', label: 'All records' },
  { value: 'patient-groups', label: 'Patient data groups' },
  { value: 'patients', label: 'Patients' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'services', label: 'Services' },
]

const sortOptions: FilterOption<TrashSortOption>[] = [
  ...trashSortOptions,
]

function restoreDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date)
}

function includesText(bookingsCount: number, sessionsCount: number) {
  const bookingText = `${bookingsCount} ${bookingsCount === 1 ? 'booking' : 'bookings'}`
  const sessionText = `${sessionsCount} ${sessionsCount === 1 ? 'session' : 'sessions'}`
  return `Includes ${bookingText} and ${sessionText}`
}

function restoreLabel(recordType: TrashIndividualRecord['recordType']) {
  switch (recordType) {
    case 'booking':
      return 'Restore booking'
    case 'session':
      return 'Restore session'
    case 'service':
      return 'Restore service'
    default:
      return 'Restore patient'
  }
}

function restoreTitle(recordType: TrashIndividualRecord['recordType']) {
  switch (recordType) {
    case 'booking':
      return 'Restore booking?'
    case 'session':
      return 'Restore session?'
    case 'service':
      return 'Restore service?'
    default:
      return 'Restore patient?'
  }
}

export default function TrashPage() {
  const { practitionerId } = usePractitioner()
  const { showSnackbar } = useSnackbar()
  const [trash, setTrash] = useState<TrashPayload>({ patients: [], bookings: [], sessions: [], services: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TrashTypeFilter>('all')
  const [sort, setSort] = useState<TrashSortOption>('deleted-desc')
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)
  const [restoreLoading, setRestoreLoading] = useState(false)

  const loadTrash = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/trash', {
      cache: 'no-store',
      headers: withPractitionerHeaders(practitionerId),
    })
    const data = await res.json()
    setTrash(data)
    setLoading(false)
  }, [practitionerId])

  useEffect(() => {
    loadTrash().catch(() => {
      setLoading(false)
      showSnackbar({ variant: 'error', message: 'Failed to load Trash.' })
    })
  }, [loadTrash, showSnackbar])

  const fullView = useMemo(() => buildTrashRecoveryView(trash), [trash])

  const filteredView = useMemo(() => {
    const filtered = filterTrashView(fullView, { query, type: typeFilter })
    return sortTrashView(filtered, sort)
  }, [fullView, query, sort, typeFilter])

  const hasAnyTrash = fullView.patientGroups.length > 0 || fullView.individualRecords.length > 0
  const hasFilteredResults = filteredView.patientGroups.length > 0 || filteredView.individualRecords.length > 0

  async function restoreDeletionGroup(deletionGroupId: string) {
    const res = await fetch(`/api/trash/${encodeURIComponent(deletionGroupId)}/restore`, {
      method: 'POST',
      headers: withPractitionerHeaders(practitionerId),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      showSnackbar({ variant: 'error', message: data?.error ?? 'Failed to restore records.' })
      return false
    }
    await loadTrash()
    return true
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return
    setRestoreLoading(true)
    try {
      const restored = await restoreDeletionGroup(restoreTarget.item.deletionGroupId)
      if (restored) {
        showSnackbar({
          variant: 'success',
          message: restoreTarget.kind === 'patient-group' ? 'Patient data restored.' : 'Record restored.',
        })
        setRestoreTarget(null)
      }
    } finally {
      setRestoreLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Trash</h1>
        <p className="mt-1 text-sm text-ink/60">Records moved to Trash can be restored for 30 days before they expire.</p>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search trash..."
          inputClassName="lg:w-80"
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
          className="lg:w-60"
        />
        <FilterSelect
          value={sort}
          onChange={setSort}
          options={sortOptions}
          className="lg:w-72"
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-brand-300/30 bg-surface px-4 py-8 text-sm text-ink/60">
          Loading Trash...
        </div>
      ) : !hasAnyTrash ? (
        <div className="rounded-xl border border-brand-300/30 bg-surface px-4 py-8 text-sm text-ink/60">
          No records are currently in Trash.
        </div>
      ) : !hasFilteredResults ? (
        <div className="rounded-xl border border-brand-300/30 bg-surface px-4 py-8 text-sm text-ink/60">
          No trashed records match your filters.
        </div>
      ) : (
        <>
          {filteredView.patientGroups.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Patient data groups</h2>
              <div className="overflow-hidden rounded-xl border border-brand-300/30 bg-surface shadow-sm">
                <div className="divide-y divide-brand-300/20">
                  {filteredView.patientGroups.map(group => (
                    <div key={group.key} className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-ink">{group.label}</p>
                        <p className="mt-1 text-xs font-medium text-ink/60">Patient data group</p>
                        <p className="mt-1 text-sm text-ink/70">{includesText(group.bookingsCount, group.sessionsCount)}</p>
                        {group.childLabels.length > 0 ? (
                          <p className="mt-1 truncate text-xs text-ink/50">
                            {group.childLabels.slice(0, 3).join(', ')}
                            {group.childLabels.length > 3 ? '...' : ''}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm text-ink/70">Restore until {restoreDate(group.restoreUntil)}</p>
                      <button
                        type="button"
                        onClick={() => setRestoreTarget({ kind: 'patient-group', item: group })}
                        className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 md:w-auto"
                      >
                        Restore all
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {filteredView.individualRecords.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-ink">Individual records</h2>
              <div className="overflow-hidden rounded-xl border border-brand-300/30 bg-surface shadow-sm">
                <div className="divide-y divide-brand-300/20">
                  {filteredView.individualRecords.map(record => (
                    <div key={record.key} className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-ink">{record.label}</p>
                        <p className="mt-1 text-xs font-medium text-ink/60">{record.subtitle}</p>
                      </div>
                      <p className="text-sm text-ink/70">Restore until {restoreDate(record.restoreUntil)}</p>
                      <button
                        type="button"
                        onClick={() => setRestoreTarget({ kind: 'individual', item: record })}
                        className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 md:w-auto"
                      >
                        {restoreLabel(record.recordType)}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleConfirmRestore}
        loading={restoreLoading}
        title={restoreTarget?.kind === 'patient-group' ? 'Restore patient data?' : restoreTarget ? restoreTitle(restoreTarget.item.recordType) : 'Restore record?'}
        description={
          restoreTarget?.kind === 'patient-group'
            ? 'This will restore the patient and all linked records that were moved to Trash together.'
            : 'This record will be restored and shown again in the relevant dashboard area.'
        }
        confirmLabel={restoreTarget?.kind === 'patient-group' ? 'Restore all' : restoreTarget ? restoreLabel(restoreTarget.item.recordType) : 'Restore'}
      >
        {restoreTarget?.kind === 'patient-group' ? (
          <div className="space-y-2">
            <p className="font-medium text-ink">{restoreTarget.item.label}</p>
            <p>Bookings: {restoreTarget.item.bookingsCount}</p>
            <p>Sessions: {restoreTarget.item.sessionsCount}</p>
          </div>
        ) : restoreTarget?.kind === 'individual' ? (
          <div>
            <p className="font-medium text-ink">{restoreTarget.item.label}</p>
            <p>{restoreTarget.item.subtitle}</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
