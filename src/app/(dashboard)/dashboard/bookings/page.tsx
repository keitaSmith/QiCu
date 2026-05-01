'use client'

import { SessionDialog } from '@/components/sessions/SessionDialog'

import { useMemo, useState, useEffect } from 'react'
import { SearchField } from '@/components/ui/SearchField'
import { FilterSelect, type FilterOption } from '@/components/ui/FilterSelect'

import type { Booking } from '@/models/booking'
import { dateFmt as dt, timeFmt, isSameLocalDay, startOfDay } from '@/lib/dates'
import { displayName, nameMap } from '@/lib/patients/selectors'

import {
  TableFrame,
  TableEl,
  THead,
  TBody,
  Tr,
  Th,
  Td,
} from '@/components/ui/QiCuTable'

import { BookingActionButtons } from '@/components/ui/RowActions'
import { StatusBadge } from '@/components/ui/StatusBadge'

import { useRightPanel } from '@/components/layout/RightPanelContext'
import { BookingDetailPanel } from '@/components/bookings/BookingDetailPanel'
import { BookingDialog } from '@/components/bookings/BookingDialog'
import { BookingImportDialog } from '@/components/bookings/BookingImportDialog'

import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { cn } from '@/lib/cn'
import { emitBookingsChanged } from '@/lib/booking-events'
import { useBookings } from '@/hooks/useBookings'
import { useServices } from '@/hooks/useServices'
import { usePatients } from '@/hooks/usePatients'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CardListSkeleton } from '@/components/ui/CardListSkeleton'
import { useSnackbar } from '@/components/ui/Snackbar'
import { buildBookingsExportCsv, buildServiceImportLookupKey, normalizePatientLookupKey, type BookingImportPreviewRow } from '@/lib/bookingsImportExport'
import { withPractitionerHeaders } from '@/lib/practitioners'
import * as PatientModel from '@/models/patient'
import { toCoreView } from '@/models/patient.coreView'
import { getErrorMessage } from '@/lib/errors'

type PatientOption = { id: string; name: string }
type ViewMode = 'today' | 'upcoming' | 'past'
type StatusFilter = 'all' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show'

type BookingWithDates = Booking & { startD: Date; endD: Date }

const PAGE_SIZE = 10

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}


function isResolved(status: Booking['status']) {
  return status === 'completed' || status === 'cancelled' || status === 'no-show'
}

function isVisibleInStatusFilter(booking: Booking, status: StatusFilter) {
  if (status === 'all') return true
  return booking.status === status
}

export default function BookingsPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('today')
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [pastPage, setPastPage] = useState(1)
  const { setRightPanelContent } = useRightPanel()
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { showSnackbar } = useSnackbar()

  const {
    practitionerId,
    bookings,
    createBookingRecord,
    replaceBooking,
    refresh: refreshBookings,
    updateBookingStatus,
    patchBookingById,
    deleteBookingById,
    loading,
    error,
  } = useBookings()
  const { patients, loading: patientsLoading, createPatientRecord } = usePatients()
  const { services, createServiceRecord } = useServices()

  const patientCoreViews = useMemo(
    () => patients.map(toCoreView),
    [patients],
  )

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionBooking, setSessionBooking] = useState<Booking | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [syncingGoogle, setSyncingGoogle] = useState(false)

  const statusOptions: FilterOption<StatusFilter>[] = [
    { value: 'all', label: 'All statuses' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'no-show', label: 'No-show' },
  ]

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  useEffect(() => {
    setUpcomingPage(1)
    setPastPage(1)
  }, [q, status])

  const now = useMemo(() => new Date(), [])
  const todayStart = startOfDay(now)

  const names = useMemo(() => nameMap(patients), [patients])

  const patientOptions: PatientOption[] = useMemo(
    () =>
      patients.map(p => ({
        id: p.id ?? '',
        name: displayName(p),
      })),
    [patients],
  )

  const preparedBookings = useMemo(() => {
    const qn = q.trim().toLowerCase()

    const matchesQ = (b: Booking) =>
      !qn ||
      b.code.toLowerCase().includes(qn) ||
      (names.get(b.patientId) ?? '').toLowerCase().includes(qn) ||
      b.serviceName.toLowerCase().includes(qn) ||
      (b.resource ?? '').toLowerCase().includes(qn)

    return bookings
      .filter(matchesQ)
      .map(b => ({ ...b, startD: new Date(b.start), endD: new Date(b.end) }))
  }, [bookings, names, q])

  const todayFiltered = useMemo(() => {
    return preparedBookings
      .filter(b => isSameLocalDay(b.startD, now))
      .filter(b => isVisibleInStatusFilter(b, status))
      .sort((a, b) => a.startD.getTime() - b.startD.getTime())
  }, [preparedBookings, now, status])

  const upcomingFiltered = useMemo(() => {
    return preparedBookings
      .filter(b => b.startD >= todayStart && !isSameLocalDay(b.startD, now))
      .filter(b => isVisibleInStatusFilter(b, status))
      .sort((a, b) => a.startD.getTime() - b.startD.getTime())
  }, [preparedBookings, todayStart, now, status])

  const pastFiltered = useMemo(() => {
    return preparedBookings
      .filter(b => b.startD < todayStart)
      .filter(b => isVisibleInStatusFilter(b, status))
      .sort((a, b) => b.startD.getTime() - a.startD.getTime())
  }, [preparedBookings, status, todayStart])

  const todayActive = useMemo(
    () => todayFiltered.filter(b => !isResolved(b.status)),
    [todayFiltered],
  )
  const todayResolved = useMemo(
    () => todayFiltered.filter(b => isResolved(b.status)),
    [todayFiltered],
  )

  const pagedUpcoming = useMemo(
    () => upcomingFiltered.slice(0, upcomingPage * PAGE_SIZE),
    [upcomingFiltered, upcomingPage],
  )
  const pagedPast = useMemo(
    () => pastFiltered.slice(0, pastPage * PAGE_SIZE),
    [pastFiltered, pastPage],
  )

  function handleCreateSessionFromBooking(booking: Booking) {
    setSessionBooking(booking)
    setSessionDialogOpen(true)
  }

  async function handleSetStatus(b: Booking, next: Booking['status']) {
    return updateBookingStatus(b.id, next)
  }

  function isPastHistoryView(currentView: ViewMode) {
    return currentView === 'past'
  }

  function canRescheduleFromMenu(b: Booking, currentView: ViewMode) {
    if (currentView === 'past') return false
    if (b.status === 'in-progress' || b.status === 'completed' || b.status === 'no-show') {
      return false
    }
    return true
  }

  function canStartVisitFromMenu(b: Booking, currentView: ViewMode) {
    if (currentView !== 'today') return false
    if (b.status === 'in-progress' || b.status === 'completed') return false
    if (b.sessionId) return false
    return true
  }

  function canBeginSessionNoteFromMenu(b: Booking, currentView: ViewMode) {
    if (currentView !== 'today') return false
    return b.status === 'in-progress' && !b.sessionId
  }

  function canWriteSessionNoteFromMenu(b: Booking) {
    return b.status === 'completed' && !b.sessionId
  }

  function canCompleteVisitFromMenu(b: Booking, currentView: ViewMode) {
    if (currentView === 'upcoming') return false
    if (b.status === 'completed') return false
    return true
  }

  function canMarkNoShowFromMenu(b: Booking, currentView: ViewMode) {
    if (currentView === 'upcoming') return false
    if (b.status === 'no-show') return false
    return true
  }

  function canCancelFromMenu(b: Booking) {
    if (b.status === 'cancelled') return false
    return true
  }

  function confirmStatusChange(message: string) {
    return window.confirm(message)
  }

  async function handleConfirmedStatusChange(
    b: Booking,
    next: Booking['status'],
    message: string,
  ) {
    if (!confirmStatusChange(message)) return null
    return handleSetStatus(b, next)
  }

  async function handleStartVisit(b: Booking) {
    if (!canStartVisitFromMenu(b, 'today')) return

    const updated = await handleSetStatus(b, 'in-progress')
    if (!updated) return

    setSessionBooking(updated)
    setSessionDialogOpen(true)
  }

  function handleViewBooking(b: Booking) {
    if (isDesktop) {
      setRightPanelContent(
        <BookingDetailPanel
          booking={b}
          patientName={names.get(b.patientId) ?? b.patientId}
        />,
      )
    } else {
      router.push(`/dashboard/bookings/${b.id}`)
    }
  }

  function handleNewBooking() {
    setDialogMode('create')
    setEditingBooking(null)
    setDialogOpen(true)
  }

  function handleEditBooking(b: Booking) {
    setDialogMode('edit')
    setEditingBooking(b)
    setDialogOpen(true)
  }

  async function handleBookingCreated(b: Booking) {
    await createBookingRecord({
      patientId: b.patientId,
      serviceId: b.serviceId,
      start: b.start,
      end: b.end,
      resource: b.resource ?? null,
      notes: b.notes ?? null,
      status: b.status,
    }, { throwOnError: true })
  }

  async function handleBookingUpdated(b: Booking) {
    const updated = await patchBookingById(b.id, {
      start: b.start,
      end: b.end,
      serviceId: b.serviceId,
      resource: b.resource ?? null,
      notes: b.notes ?? null,
    }, { throwOnError: true })

    if (updated) {
      replaceBooking(updated)
      emitBookingsChanged()
    }
  }

  function getBookingMenuItems(b: Booking, currentView: ViewMode) {
    const extras: { label: string; onSelect: () => void; variant?: 'default' | 'danger' }[] = []
    const isPastBooking = isPastHistoryView(currentView)

    if (canRescheduleFromMenu(b, currentView)) {
      extras.push({ label: 'Reschedule', onSelect: () => handleEditBooking(b) })
    }

    if (canStartVisitFromMenu(b, currentView)) {
      extras.push({ label: 'Start visit', onSelect: () => void handleStartVisit(b) })
    }

    if (canBeginSessionNoteFromMenu(b, currentView)) {
      extras.push({ label: 'Begin session note', onSelect: () => handleCreateSessionFromBooking(b) })
    }

    if (canCompleteVisitFromMenu(b, currentView)) {
      extras.push({
        label: isPastBooking ? 'Mark as complete' : 'Complete visit',
        onSelect: () =>
          void (isPastBooking
            ? handleConfirmedStatusChange(
                b,
                'completed',
                `Mark past booking ${b.code} as complete?`,
              )
            : handleSetStatus(b, 'completed')),
      })
    }

    if (canWriteSessionNoteFromMenu(b)) {
      extras.push({ label: 'Write session note', onSelect: () => handleCreateSessionFromBooking(b) })
    }

    if (canMarkNoShowFromMenu(b, currentView)) {
      extras.push({
        label: isPastBooking ? 'Mark as no-show' : 'Set no-show',
        onSelect: () =>
          void handleConfirmedStatusChange(
            b,
            'no-show',
            isPastBooking
              ? `Mark past booking ${b.code} as no-show?`
              : `Mark booking ${b.code} as no-show?`,
          ),
      })
    }

    if (canCancelFromMenu(b)) {
      extras.push({
        label: isPastBooking ? 'Mark as cancelled' : 'Cancel',
        onSelect: () =>
          void handleConfirmedStatusChange(
            b,
            'cancelled',
            isPastBooking
              ? `Mark past booking ${b.code} as cancelled?`
              : `Cancel booking ${b.code}?`,
          ),
        variant: 'danger',
      })
    }

    return extras
  }

  async function handleDeleteBooking(b: Booking) {
    if (!confirm(`Delete booking ${b.code}? This cannot be undone.`)) return
    await deleteBookingById(b.id)
  }


  function handleExportBookings() {
    const csv = buildBookingsExportCsv(bookings, patientCoreViews)
    const datePart = new Date().toISOString().slice(0, 10)
    downloadCsv(`qicu-bookings-${datePart}.csv`, csv)
    showSnackbar({ variant: 'success', message: 'Bookings exported as CSV.' })
  }

  async function handleGoogleReconcile() {
    try {
      setSyncingGoogle(true)
      const res = await fetch('/api/integrations/google/reconcile', {
        method: 'POST',
        headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to sync linked Google bookings.')
      }

      await refreshBookings()
      showSnackbar({
        variant: 'success',
        message:
          data?.linked > 0
            ? `Google sync complete. ${data.updated ?? 0} updated, ${data.cancelled ?? 0} cancelled, ${data.unchanged ?? 0} unchanged.`
            : 'No linked Google bookings were found.',
      })
    } catch (error: unknown) {
      showSnackbar({ variant: 'error', message: getErrorMessage(error, 'Failed to sync linked Google bookings.') })
    } finally {
      setSyncingGoogle(false)
    }
  }

  async function handleImportRows(rows: BookingImportPreviewRow[]) {
    let importedCount = 0
    let createdPatientCount = 0
    let createdServiceCount = 0

    const patientIdByName = new Map(
      patientCoreViews.map(patient => [normalizePatientLookupKey(patient.name), patient.id]),
    )
    const serviceByKey = new Map(
      services.map(service => [
        buildServiceImportLookupKey(service.name, service.durationMinutes),
        service,
      ]),
    )

    const buildImportedPatient = (fullName: string) => {
      const cleaned = fullName.trim().replace(/\s+/g, ' ')
      const parts = cleaned.split(' ').filter(Boolean)
      const firstName = parts.shift() ?? cleaned
      const lastName = parts.join(' ') || 'Imported'
      return PatientModel.create(
        {
          firstName,
          lastName,
          gender: 'prefer_not_to_say',
          dob: '1900-01-01',
          inviteMode: 'profileOnly',
        },
        { locale: 'de-CH' },
      )
    }

    for (const row of rows) {
      let patientId = row.matchedPatientId
      let serviceId = row.matchedServiceId

      if (!patientId && row.patientName) {
        const patientKey = normalizePatientLookupKey(row.patientName)
        patientId = patientIdByName.get(patientKey)

        if (!patientId) {
          const createdPatient = await createPatientRecord(buildImportedPatient(row.patientName))
          if (!createdPatient?.id) continue

          patientId = createdPatient.id
          patientIdByName.set(patientKey, patientId)
          createdPatientCount += 1
        }
      }

      if (!serviceId && row.serviceName) {
        const durationMinutes = Math.max(
          15,
          Math.round((new Date(row.end).getTime() - new Date(row.start).getTime()) / 60000),
        )
        const serviceKey = buildServiceImportLookupKey(row.serviceName, durationMinutes)
        const existingService = serviceByKey.get(serviceKey)
        serviceId = existingService?.id

        if (!serviceId) {
          const createdService = await createServiceRecord({
            name: row.serviceName.trim(),
            durationMinutes,
            description: 'Imported from bookings CSV',
            active: true,
          })

          if (!createdService?.id) continue

          serviceId = createdService.id
          serviceByKey.set(serviceKey, createdService)
          createdServiceCount += 1
        }
      }

      if (!patientId || !serviceId) continue

      const created = await createBookingRecord({
        patientId,
        serviceId,
        start: row.start,
        end: row.end,
        resource: row.resource || null,
        notes: row.notes || null,
        status: row.status,
        externalSource: row.externalSource,
        externalCalendarId: row.externalCalendarId || null,
        externalEventId: row.externalEventId || null,
        externalSyncStatus: row.externalEventId ? 'imported' : null,
        skipGoogleWriteback: Boolean(row.externalEventId),
      })

      if (created) importedCount += 1
    }

    if (importedCount === 0) {
      showSnackbar({ variant: 'error', message: 'No valid bookings were imported.' })
      throw new Error('No valid bookings were imported.')
    }

    const details: string[] = []
    if (createdPatientCount > 0) details.push(`${createdPatientCount} patient${createdPatientCount === 1 ? '' : 's'}`)
    if (createdServiceCount > 0) details.push(`${createdServiceCount} service${createdServiceCount === 1 ? '' : 's'}`)

    showSnackbar({
      variant: 'success',
      message: details.length > 0
        ? `Imported ${importedCount} booking${importedCount === 1 ? '' : 's'} and created ${details.join(' and ')}.`
        : `Imported ${importedCount} booking${importedCount === 1 ? '' : 's'}.`,
    })
  }

  function renderDesktopRows(items: BookingWithDates[], emptyLabel: string, currentView: ViewMode) {
    return (
      <div className="hidden md:block">
        <TableFrame>
          <TableEl className="table-fixed">
            <THead>
              <Tr>
                <Th className="rounded-tl-md rounded-bl-md">Patient</Th>
                <Th>Service</Th>
                <Th>Resource</Th>
                <Th>Start</Th>
                <Th>Status</Th>
                <Th className="text-right rounded-tr-md rounded-br-md">Actions</Th>
              </Tr>
            </THead>

            <TBody>
              {(loading || patientsLoading) && <TableSkeleton rows={4} columns={6} />}

              {!(loading || patientsLoading) && items.map(b => (
                <Tr key={b.id}>
                  <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>

                  <Td>
                    <div className="font-medium text-ink">{b.serviceName}</div>
                    <div className="text-xs text-ink/60">{b.serviceDurationMinutes} min</div>
                  </Td>

                  <Td className="text-ink/70">{b.resource ?? '—'}</Td>

                  <Td className="text-ink/70">
                    <div>{dt.format(new Date(b.start))}</div>
                    <div className="text-xs text-ink/50">{timeFmt.format(new Date(b.start))}</div>
                  </Td>

                  <Td>
                    <StatusBadge status={b.status} showText />
                  </Td>

                  <Td className="text-right">
                    <BookingActionButtons
                      onView={() => handleViewBooking(b)}
                      onDelete={() => void handleDeleteBooking(b)}
                      extras={getBookingMenuItems(b, currentView)}
                    />
                  </Td>
                </Tr>
              ))}

              {!(loading || patientsLoading) && items.length === 0 && (
                <Tr>
                  <Td className="text-center text-ink/60" colSpan={6}>
                    {emptyLabel}
                  </Td>
                </Tr>
              )}
            </TBody>
          </TableEl>
        </TableFrame>
      </div>
    )
  }

  function renderMobileCards(items: BookingWithDates[], emptyLabel: string, currentView: ViewMode) {
    return (
      <div className="space-y-3 md:hidden">
        {!(loading || patientsLoading) && items.length === 0 && (
          <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
            {emptyLabel}
          </div>
        )}

        {(loading || patientsLoading) && <CardListSkeleton items={4} lines={3} />}

              {!(loading || patientsLoading) && items.map(b => (
          <div
            key={b.id}
            className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-ink">
                  {names.get(b.patientId) ?? 'Unknown'}
                </div>

                <div className="text-sm text-ink/80">
                  {b.serviceName} ({b.serviceDurationMinutes} min)
                </div>

                <div className="text-sm text-ink/70">{b.resource ?? '—'}</div>
              </div>

              <StatusBadge status={b.status} showText={false} />
            </div>

            <div className="mt-2 text-sm text-ink/70">
              <div>{dt.format(new Date(b.start))}</div>
              <div className="text-xs text-ink/60">{timeFmt.format(new Date(b.start))}</div>
            </div>

            {b.notes && <p className="mt-2 text-sm text-ink/60">{b.notes}</p>}

            <div className="mt-3 flex justify-end">
              <BookingActionButtons
                onView={() => handleViewBooking(b)}
                onDelete={() => void handleDeleteBooking(b)}
                extras={getBookingMenuItems(b, currentView)}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderBookingList(items: BookingWithDates[], emptyLabel: string, currentView: ViewMode) {
    return (
      <>
        {renderDesktopRows(items, emptyLabel, currentView)}
        {renderMobileCards(items, emptyLabel, currentView)}
      </>
    )
  }

  const viewCounts = {
    today: todayFiltered.length,
    upcoming: upcomingFiltered.length,
    past: pastFiltered.length,
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Bookings</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search bookings…"
          />

          <button
            type="button"
            onClick={() => setImportDialogOpen(true)}
            className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 focus:outline-none"
          >
            Import
          </button>

          <button
            type="button"
            onClick={() => void handleGoogleReconcile()}
            disabled={syncingGoogle}
            className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncingGoogle ? 'Syncing…' : 'Sync Google'}
          </button>

          <button
            type="button"
            onClick={handleExportBookings}
            className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 focus:outline-none"
          >
            Export
          </button>

          <button
            type="button"
            onClick={handleNewBooking}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none"
          >
            New booking
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-full flex-wrap gap-2 rounded-2xl border border-brand-300/30 bg-surface p-1.5 lg:w-auto">
          {([
            { value: 'today', label: 'Today' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ] as const).map(tab => {
            const active = view === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setView(tab.value)}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-ink hover:bg-brand-300/10',
                )}
              >
                {tab.label}
                <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs', active ? 'bg-white/15 text-white' : 'bg-brand-300/20 text-ink/70')}>
                  {viewCounts[tab.value]}
                </span>
              </button>
            )
          })}
        </div>

        <FilterSelect
          value={status}
          onChange={setStatus}
          options={statusOptions}
          className="w-full sm:w-52 lg:ml-auto"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {view === 'today' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Today</h2>
            </div>
            {renderBookingList(
              status === 'all' ? todayActive : todayFiltered,
              status === 'all' ? 'No active bookings today.' : 'No bookings match this status today.',
              'today',
            )}
          </section>

          {status === 'all' && (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-ink">Resolved today</h3>
              </div>
              {renderBookingList(todayResolved, 'No resolved bookings today yet.', 'today')}
            </section>
          )}
        </div>
      )}

      {view === 'upcoming' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Upcoming</h2>
          </div>

          {renderBookingList(pagedUpcoming, 'No upcoming bookings found.', 'upcoming')}

          {upcomingFiltered.length > pagedUpcoming.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setUpcomingPage(prev => prev + 1)}
                className="rounded-lg border border-brand-300/40 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Load 10 more
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'past' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Past</h2>
          </div>

          {renderBookingList(pagedPast, 'No past bookings found.', 'past')}

          {pastFiltered.length > pagedPast.length && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPastPage(prev => prev + 1)}
                className="rounded-lg border border-brand-300/40 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Load 10 more
              </button>
            </div>
          )}
        </div>
      )}

      <BookingImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        patients={patientCoreViews}
        services={services}
        onImportRows={handleImportRows}
      />

      <BookingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        booking={editingBooking ?? undefined}
        patients={patientOptions}
        onCreated={handleBookingCreated}
        onUpdated={handleBookingUpdated}
        onBookingConflict={async () => {
          await refreshBookings()
        }}
        existingBookings={bookings}
      />
      <SessionDialog
        open={sessionDialogOpen}
        onClose={() => {
          setSessionDialogOpen(false)
          setSessionBooking(null)
        }}
        mode="create"
        patientId={sessionBooking?.patientId}
        patientName={sessionBooking ? names.get(sessionBooking.patientId) ?? undefined : undefined}
        bookingContext={
          sessionBooking
            ? {
                id: sessionBooking.id,
                code: sessionBooking.code,
                start: sessionBooking.start,
                serviceId: sessionBooking.serviceId,
                serviceName: sessionBooking.serviceName,
              }
            : undefined
        }
        onCreated={() => {
          refreshBookings().catch(() => null)
          emitBookingsChanged()

          setSessionDialogOpen(false)
          setSessionBooking(null)
        }}
      />
    </div>
  )
}
