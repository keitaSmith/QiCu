'use client'

import { SessionDialog } from '@/components/sessions/SessionDialog'

import { useMemo, useState, useEffect } from 'react'
import { SearchField } from '@/components/ui/SearchField'
import { FilterSelect, type FilterOption } from '@/components/ui/FilterSelect'

import { BOOKINGS } from '@/data/bookings'
import { PATIENTS } from '@/data/patients'
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

import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { cn } from '@/lib/cn'
import { BOOKINGS_CHANGED_EVENT, emitBookingsChanged } from '@/lib/booking-events'

type PatientOption = { id: string; name: string }
type ViewMode = 'today' | 'upcoming' | 'past'
type StatusFilter = 'all' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show'

type BookingWithDates = Booking & { startD: Date; endD: Date }

const PAGE_SIZE = 10

function statusLabel(status: Booking['status']) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'in-progress':
      return 'In progress'
    case 'no-show':
      return 'No-show'
    default:
      return status.replace(/\b\w/g, c => c.toUpperCase())
  }
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

  const [bookings, setBookings] = useState<Booking[]>(BOOKINGS)

  const refreshBookings = useMemo(() => async () => {
    try {
      const res = await fetch('/api/bookings', { cache: 'no-store' })
      if (!res.ok) return
      const items: Booking[] = await res.json()
      setBookings(items)
    } catch {
      // fallback to seeded BOOKINGS
    }
  }, [])

  useEffect(() => {
    refreshBookings()
  }, [refreshBookings])

  useEffect(() => {
    const onChanged = () => {
      refreshBookings().catch(() => null)
    }
    window.addEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
  }, [refreshBookings])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionBooking, setSessionBooking] = useState<Booking | null>(null)

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

  const now = new Date()
  const todayStart = startOfDay(now)

  const names = useMemo(() => nameMap(PATIENTS), [])

  const patientOptions: PatientOption[] = useMemo(
    () =>
      PATIENTS.map(p => ({
        id: p.id,
        name: displayName(p),
      })),
    [],
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

  async function patchBooking(id: string, patch: Partial<Booking>) {
    const res = await fetch(`/api/bookings/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    )
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error ?? 'Failed to update booking')
    }
    return (await res.json()) as Booking
  }

  async function handleSetStatus(b: Booking, next: Booking['status']) {
    const updated = await patchBooking(b.id, { status: next })
    setBookings(prev => prev.map(x => (x.id === updated.id ? updated : x)))
    emitBookingsChanged()
    return updated
  }

  async function handleStartVisit(b: Booking) {
    const updated = await handleSetStatus(b, 'in-progress')
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

  function handleBookingCreated(b: Booking) {
    setBookings(prev => [...prev, b])
    emitBookingsChanged()
  }

  function handleBookingUpdated(b: Booking) {
    setBookings(prev =>
      prev.map(existing => (existing.id === b.id ? b : existing)),
    )
    emitBookingsChanged()
  }

  function bookingExtras(b: Booking) {
    const extras: { label: string; onSelect: () => void }[] = []

    if (b.status === 'confirmed') {
      const nowMs = Date.now()
      const startMs = new Date(b.start).getTime()
      const endMs = new Date(b.end).getTime()
      if (startMs <= nowMs && endMs >= nowMs) {
        extras.push({ label: 'Start visit', onSelect: () => void handleStartVisit(b) })
      }
    }

    if (b.status === 'in-progress') {
      if (!b.sessionId) {
        extras.push({ label: 'Begin session note', onSelect: () => handleCreateSessionFromBooking(b) })
      }
      extras.push({ label: 'Complete visit', onSelect: () => void handleSetStatus(b, 'completed') })
    }

    if (b.status === 'completed' && !b.sessionId) {
      extras.push({ label: 'Write session note', onSelect: () => handleCreateSessionFromBooking(b) })
    }

    return extras
  }

  function canSetOutcome(b: Booking) {
    return b.status === 'confirmed'
  }

  function renderDesktopRows(items: BookingWithDates[], emptyLabel: string) {
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
              {items.map(b => (
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
                      onReschedule={() => handleEditBooking(b)}
                      onCancel={canSetOutcome(b) ? () => handleSetStatus(b, 'cancelled') : undefined}
                      onNoShow={canSetOutcome(b) ? () => handleSetStatus(b, 'no-show') : undefined}
                      onDelete={() => console.log('delete booking', b.id)}
                      extras={bookingExtras(b)}
                    />
                  </Td>
                </Tr>
              ))}

              {items.length === 0 && (
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

  function renderMobileCards(items: BookingWithDates[], emptyLabel: string) {
    return (
      <div className="space-y-3 md:hidden">
        {items.length === 0 && (
          <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
            {emptyLabel}
          </div>
        )}

        {items.map(b => (
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
                onReschedule={() => handleEditBooking(b)}
                onCancel={canSetOutcome(b) ? () => handleSetStatus(b, 'cancelled') : undefined}
                onNoShow={canSetOutcome(b) ? () => handleSetStatus(b, 'no-show') : undefined}
                onDelete={() => console.log('delete booking', b.id)}
                extras={bookingExtras(b)}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderBookingList(items: BookingWithDates[], emptyLabel: string) {
    return (
      <>
        {renderDesktopRows(items, emptyLabel)}
        {renderMobileCards(items, emptyLabel)}
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
            onClick={handleNewBooking}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none"
          >
            New booking
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="inline-flex w-full flex-wrap gap-2 rounded-2xl border border-brand-300/30 bg-surface p-1.5 sm:w-auto">
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Status</p>
            <p className="text-xs text-ink/60">Filter the current booking view by status.</p>
          </div>
          <FilterSelect
            value={status}
            onChange={setStatus}
            options={statusOptions}
            className="sm:w-52"
          />
        </div>
      </div>

      {view === 'today' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Today</h2>
            </div>
            {renderBookingList(
              status === 'all' ? todayActive : todayFiltered,
              status === 'all' ? 'No active bookings today.' : 'No bookings match this status today.',
            )}
          </section>

          {status === 'all' && (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-ink">Resolved today</h3>
              </div>
              {renderBookingList(todayResolved, 'No resolved bookings today yet.')}
            </section>
          )}
        </div>
      )}

      {view === 'upcoming' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Upcoming</h2>
            <p className="text-sm text-ink/60">
              Future bookings are paginated so the practitioner sees the nearest appointments first.
            </p>
          </div>

          {renderBookingList(pagedUpcoming, 'No upcoming bookings found.')}

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
            <p className="text-sm text-ink/60">
              Historical bookings stay in one place so practitioners can review and correct older records when needed.
            </p>
          </div>

          {renderBookingList(pagedPast, 'No past bookings found.')}

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

      <BookingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        booking={editingBooking ?? undefined}
        patients={patientOptions}
        onCreated={handleBookingCreated}
        onUpdated={handleBookingUpdated}
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
