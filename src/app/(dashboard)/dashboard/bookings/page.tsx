// /app/dashboard/bookings/page.tsx (or wherever your BookingsPage lives)
'use client'

import { useMemo, useState, useEffect } from 'react'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { SearchField } from '@/components/ui/SearchField'
import { FilterSelect, type FilterOption } from '@/components/ui/FilterSelect'

import { BOOKINGS } from '@/data/bookings'
import { PATIENTS } from '@/data/patients'
import type { Booking } from '@/models/booking'
import { dateFmt as dt, isSameLocalDay, startOfDay } from '@/lib/dates'
import { displayName, nameMap } from '@/lib/patients/selectors'

// ✅ Shared UI
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

import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { BookingDialog } from '@/components/bookings/BookingDialog'

type PatientOption = { id: string; name: string }

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function BookingsPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Booking['status']>('all')
  const { setRightPanelContent } = useRightPanel()
  const router = useRouter()
  const isDesktop = useIsDesktop()

  // Local state for bookings (starts from mock data)
  const [bookings, setBookings] = useState<Booking[]>(BOOKINGS)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

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

  // stable map: patientId -> display name
  const names = useMemo(() => nameMap(PATIENTS), [])

  // For dialogs that need a patient selector
  const patientOptions: PatientOption[] = useMemo(
    () =>
      PATIENTS.map(p => ({
        id: p.id,
        name: displayName(p),
      })),
    [],
  )

  const { todayBookings, upcomingBookings } = useMemo(() => {
    const qn = q.trim().toLowerCase()

    const matchesQ = (b: Booking) =>
      !qn ||
      b.code.toLowerCase().includes(qn) ||
      (names.get(b.patientId) ?? '').toLowerCase().includes(qn) ||
      b.service.toLowerCase().includes(qn) ||
      (b.resource ?? '').toLowerCase().includes(qn)

    const items = bookings
      .map(b => ({ ...b, startD: new Date(b.start), endD: new Date(b.end) }))
      .sort((a, b) => a.startD.getTime() - b.startD.getTime())

    const today = items.filter(b => isSameLocalDay(b.startD, now) && matchesQ(b))
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

  // (Optional) if you later want an edit action:
  function handleEditBooking(b: Booking) {
    setDialogMode('edit')
    setEditingBooking(b)
    setDialogOpen(true)
  }

  function handleBookingCreated(b: Booking) {
    setBookings(prev => [...prev, b])
  }

  function handleBookingUpdated(b: Booking) {
    setBookings(prev => prev.map(existing => (existing.id === b.id ? b : existing)))
  }

  return (
    <div className="space-y-10">
      {/* Header matches Patients (nice mobile stacking) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Bookings</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Search – full width on mobile */}
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

          {/* Primary CTA – matches Patients */}
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
        {/* Table (md+) using shared primitives */}
        <div className="hidden md:block">
          <TableFrame>
            <TableEl>
              <THead>
                <Tr>
                  <Th className="rounded-tl-md rounded-bl-md">Code</Th>
                  <Th>Patient</Th>
                  <Th>Service</Th>
                  <Th>Resource</Th>
                  <Th>Start</Th>
                  <Th>End</Th>
                  <Th>Status</Th>
                  <Th className="text-right rounded-tr-md rounded-br-md">
                    Actions
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {todayBookings.map(b => (
                  <Tr key={b.id}>
                    <Td className="font-medium text-ink">{b.code}</Td>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>
                    <Td>{b.service}</Td>
                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>
                    <Td className="text-ink/70">
                      {dt.format(new Date(b.start))}
                    </Td>
                    <Td className="text-ink/70">
                      {dt.format(new Date(b.end))}
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} showText />
                    </Td>
                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => handleViewBooking(b)}
                        onReschedule={() => console.log('reschedule', b.id)}
                        onCancel={() => console.log('cancel', b.id)}
                        onNoShow={() => console.log('set no-show', b.id)}
                        onDelete={() => console.log('delete booking', b.id)}
                      />
                    </Td>
                  </Tr>
                ))}
                {todayBookings.length === 0 && (
                  <Tr>
                    <Td className="text-center text-ink/60" colSpan={8}>
                      No bookings today.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </TableEl>
          </TableFrame>
        </div>

        {/* Cards (mobile) – match Patients card style */}
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
                  <div className="mb-1 text-xs text-ink/70">{b.code}</div>
                  <div className="text-sm text-ink/70">
                    {b.service} · {b.resource ?? '—'}
                  </div>
                </div>
                {/* Dot only on mobile header */}
                <StatusBadge status={b.status} showText={false} />
              </div>
              <div className="mt-2 text-sm text-ink/70">
                <div>Start: {dt.format(new Date(b.start))}</div>
                <div>End: {dt.format(new Date(b.end))}</div>
              </div>
              {b.notes && (
                <p className="mt-2 text-sm text-ink/60">{b.notes}</p>
              )}
              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => handleViewBooking(b)}
                  onReschedule={() => console.log('reschedule', b.id)}
                  onCancel={() => console.log('cancel', b.id)}
                  onNoShow={() => console.log('set no-show', b.id)}
                  onDelete={() => console.log('delete booking', b.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* UPCOMING */}
      <Collapsible
        title="Upcoming"
        count={upcomingBookings.length}
        defaultOpen
      >
        {/* Table (md+) using shared primitives */}
        <div className="hidden md:block">
          <TableFrame>
            <TableEl>
              <THead>
                <Tr>
                  <Th className="rounded-tl-md rounded-bl-md">Code</Th>
                  <Th>Patient</Th>
                  <Th>Service</Th>
                  <Th>Resource</Th>
                  <Th>Start</Th>
                  <Th>End</Th>
                  <Th>Status</Th>
                  <Th className="text-right rounded-tr-md rounded-bl-md">
                    Actions
                  </Th>
                </Tr>
              </THead>

              <TBody>
                {upcomingFiltered.map(b => (
                  <Tr key={b.id}>
                    <Td className="font-medium text-ink">{b.code}</Td>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>
                    <Td>{b.service}</Td>
                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>
                    <Td className="text-ink/70">
                      {dt.format(new Date(b.start))}
                    </Td>
                    <Td className="text-ink/70">
                      {dt.format(new Date(b.end))}
                    </Td>
                    <Td>
                      <StatusBadge status={b.status} showText />
                    </Td>
                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => handleViewBooking(b)}
                        onReschedule={() => console.log('reschedule', b.id)}
                        onCancel={() => console.log('cancel', b.id)}
                        onNoShow={() => console.log('set no-show', b.id)}
                        onDelete={() => console.log('delete booking', b.id)}
                      />
                    </Td>
                  </Tr>
                ))}
                {upcomingFiltered.length === 0 && (
                  <Tr>
                    <Td className="text-center text-ink/60" colSpan={8}>
                      No upcoming bookings found.
                    </Td>
                  </Tr>
                )}
              </TBody>
            </TableEl>
          </TableFrame>
        </div>

        {/* Cards (mobile) – match Patients card style */}
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
                  <div className="mb-1 text-xs text-ink/70">{b.code}</div>
                  <div className="text-sm text-ink/70">
                    {b.service} · {b.resource ?? '—'}
                  </div>
                </div>
                <StatusBadge status={b.status} showText={false} />
              </div>
              <div className="mt-2 text-sm text-ink/70">
                <div>Start: {dt.format(new Date(b.start))}</div>
                <div>End: {dt.format(new Date(b.end))}</div>
              </div>
              {b.notes && (
                <p className="mt-2 text-sm text-ink/60">{b.notes}</p>
              )}
              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => handleViewBooking(b)}
                  onReschedule={() => console.log('reschedule', b.id)}
                  onCancel={() => console.log('cancel', b.id)}
                  onNoShow={() => console.log('set no-show', b.id)}
                  onDelete={() => console.log('delete booking', b.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Booking dialog */}
      <BookingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        booking={editingBooking ?? undefined}
        patients={patientOptions}
        onCreated={handleBookingCreated}
        onUpdated={handleBookingUpdated}
      />
    </div>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
