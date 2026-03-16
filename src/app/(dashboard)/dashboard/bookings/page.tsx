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

// Shared table UI
import {
  TableFrame,
  TableEl,
  THead,
  TBody,
  Tr,
  Th,
  Td,
} from '@/components/ui/QiCuTable'

import { Collapsible } from '@/components/ui/Collapsible'
import { BookingActionButtons } from '@/components/ui/RowActions'
import { StatusBadge } from '@/components/ui/StatusBadge'

import { useRightPanel } from '@/components/layout/RightPanelContext'
import { BookingDetailPanel } from '@/components/bookings/BookingDetailPanel'
import { BookingDialog } from '@/components/bookings/BookingDialog'

import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'

type PatientOption = { id: string; name: string }

export default function BookingsPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Booking['status']>('all')
  const { setRightPanelContent } = useRightPanel()
  const router = useRouter()
  const isDesktop = useIsDesktop()

  const [bookings, setBookings] = useState<Booking[]>(BOOKINGS)

  // Prefer the API boundary once mounted (keeps Tasks + other pages consistent)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/bookings', { cache: 'no-store' })
        if (!res.ok) return
        const items: Booking[] = await res.json()
        if (!alive) return
        setBookings(items)
      } catch {
        // fallback to seeded BOOKINGS
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

  // session-from-booking state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionBooking, setSessionBooking] = useState<Booking | null>(null)

  const statusOptions: FilterOption<'all' | Booking['status']>[] = [
    { value: 'all', label: 'All statuses (upcoming)' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'fulfilled', label: 'Fulfilled' },
    { value: 'no-show', label: 'No show' },
  ]

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  const now = new Date()

  // name map: patientId → display name
  const names = useMemo(() => nameMap(PATIENTS), [])

  // patient options for select field
  const patientOptions: PatientOption[] = useMemo(
    () =>
      PATIENTS.map(p => ({
        id: p.id,
        name: displayName(p),
      })),
    [],
  )

  // Searching + grouping
  const { todayBookings, upcomingBookings } = useMemo(() => {
    const qn = q.trim().toLowerCase()

    const matchesQ = (b: Booking) =>
      !qn ||
      b.code.toLowerCase().includes(qn) ||
      (names.get(b.patientId) ?? '').toLowerCase().includes(qn) ||
      b.serviceName.toLowerCase().includes(qn) ||
      (b.resource ?? '').toLowerCase().includes(qn)

    const items = bookings
      .map(b => ({ ...b, startD: new Date(b.start), endD: new Date(b.end) }))
      .sort((a, b) => a.startD.getTime() - b.startD.getTime())

    const today = items.filter(
      b => isSameLocalDay(b.startD, now) && matchesQ(b),
    )

    const upcoming = items.filter(
      b =>
        !isSameLocalDay(b.startD, now) &&
        b.startD >= startOfDay(now) &&
        matchesQ(b),
    )

    return { todayBookings: today, upcomingBookings: upcoming }
  }, [q, now, names, bookings])

  const upcomingFiltered = useMemo(() => {
    if (status === 'all') return upcomingBookings
    return upcomingBookings.filter(b => b.status === status)
  }, [upcomingBookings, status])

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
  }

  function handleBookingUpdated(b: Booking) {
    setBookings(prev =>
      prev.map(existing => (existing.id === b.id ? b : existing)),
    )
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Bookings</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search all bookings…"
          />

          <FilterSelect
            value={status}
            onChange={setStatus}
            options={statusOptions}
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

      {/* TODAY */}
      <Collapsible title="Today" count={todayBookings.length} defaultOpen>
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
                {todayBookings.map(b => (
                  <Tr key={b.id}>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>

                    {/* Service Name + Duration */}
                    <Td>
                      <div className="font-medium text-ink">{b.serviceName}</div>
                      <div className="text-xs text-ink/60">
                        {b.serviceDurationMinutes} min
                      </div>
                    </Td>

                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>

                    <Td className="text-ink/70">
                      <div>{dt.format(new Date(b.start))}</div>
                      <div className="text-xs text-ink/50">
                        {timeFmt.format(new Date(b.start))}
                      </div>
                    </Td>

                    <Td>
                      <StatusBadge status={b.status} showText />
                    </Td>

                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => handleViewBooking(b)}
                        onReschedule={() => handleEditBooking(b)}
                        onCancel={() => handleSetStatus(b, 'cancelled')}
                        onNoShow={() => handleSetStatus(b, 'no-show')}
                        onDelete={() => console.log('delete booking', b.id)}
                        extras={[
                          {
                            label: 'Create session',
                            onSelect: () => handleCreateSessionFromBooking(b),
                          },
                        ]}
                      />
                    </Td>
                  </Tr>
                ))}

                {todayBookings.length === 0 && (
                  <Tr>
                    <Td className="text-center text-ink/60" colSpan={6}>
                      No bookings today.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </TableEl>
          </TableFrame>
        </div>

        {/* Mobile Cards */}
        <div className="space-y-3 md:hidden">
          {todayBookings.length === 0 && (
            <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
              No bookings today.
            </div>
          )}

          {todayBookings.map(b => (
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
                <div>Start: {dt.format(new Date(b.start))}</div>
                <div className="text-xs text-ink/60">
                  {timeFmt.format(new Date(b.start))}
                </div>
              </div>

              {b.notes && (
                <p className="mt-2 text-sm text-ink/60">{b.notes}</p>
              )}

              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => handleViewBooking(b)}
                  onReschedule={() => handleEditBooking(b)}
                  onCancel={() => handleSetStatus(b, 'cancelled')}
                  onNoShow={() => handleSetStatus(b, 'no-show')}
                  onDelete={() => console.log('delete booking', b.id)}
                  extras={[
                          {
                            label: 'Create session',
                            onSelect: () => handleCreateSessionFromBooking(b),
                          },
                        ]}
                />
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* UPCOMING */}
      <Collapsible title="Upcoming" count={upcomingFiltered.length} defaultOpen>
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
                {upcomingFiltered.map(b => (
                  <Tr key={b.id}>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>

                    <Td>
                      <div className="font-medium text-ink">{b.serviceName}</div>
                      <div className="text-xs text-ink/60">
                        {b.serviceDurationMinutes} min
                      </div>
                    </Td>

                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>

                    <Td className="text-ink/70">
                      <div>{dt.format(new Date(b.start))}</div>
                      <div className="text-xs text-ink/50">
                        {timeFmt.format(new Date(b.start))}
                      </div>
                    </Td>

                    <Td>
                      <StatusBadge status={b.status} showText />
                    </Td>

                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => handleViewBooking(b)}
                        onReschedule={() => handleEditBooking(b)}
                        onCancel={() => handleSetStatus(b, 'cancelled')}
                        onNoShow={() => handleSetStatus(b, 'no-show')}
                        onDelete={() => console.log('delete booking', b.id)}
                        extras={[
                          {
                            label: 'Create session',
                            onSelect: () => handleCreateSessionFromBooking(b),
                          },
                        ]}
                      />
                    </Td>
                  </Tr>
                ))}

                {upcomingFiltered.length === 0 && (
                  <Tr>
                    <Td className="text-center text-ink/60" colSpan={6}>
                      No upcoming bookings found.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </TableEl>
          </TableFrame>
        </div>

        {/* Mobile Cards */}
        <div className="space-y-3 md:hidden">
          {upcomingFiltered.length === 0 && (
            <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
              No upcoming bookings found.
            </div>
          )}

          {upcomingFiltered.map(b => (
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
                <div className="text-xs text-ink/60">
                  {timeFmt.format(new Date(b.start))}
                </div>
              </div>

              {b.notes && (
                <p className="mt-2 text-sm text-ink/60">{b.notes}</p>
              )}

              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => handleViewBooking(b)}
                  onReschedule={() => handleEditBooking(b)}
                  onCancel={() => handleSetStatus(b, 'cancelled')}
                  onNoShow={() => handleSetStatus(b, 'no-show')}
                  onDelete={() => console.log('delete booking', b.id)}
                  extras={[
                          {
                            label: 'Create session',
                            onSelect: () => handleCreateSessionFromBooking(b),
                          },
                        ]}
                />
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* dialog */}
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
        patientName={
          sessionBooking ? names.get(sessionBooking.patientId) ?? undefined : undefined
        }
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
          // Close after successful creation; refresh bookings so sessionId/status are reflected
          fetch('/api/bookings', { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : null))
            .then((items: Booking[] | null) => {
              if (items) setBookings(items)
            })
            .catch(() => null)

          setSessionDialogOpen(false)
          setSessionBooking(null)
        }}
      />
    </div>
    
  )
}
