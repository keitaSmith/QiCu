'use client'

import { useMemo, useState } from 'react'
import { FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

import { BOOKINGS } from '@/data/bookings'
import { PATIENTS } from '@/data/patients'
import type { Booking } from '@/models/booking'
import { dateFmt as dt, isSameLocalDay, startOfDay } from '@/lib/dates'
import { nameMap } from '@/lib/patients/selectors'

// ✅ Shared UI
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { Collapsible } from '@/components/ui/Collapsible'
import { BookingActionButtons } from '@/components/ui/RowActions'
import { StatusBadge } from '@/components/ui/StatusBadge'

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function BookingsPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | Booking['status']>('all')
  const now = new Date()

  // stable map: patientId -> display name
  const names = useMemo(() => nameMap(PATIENTS), [])

  const { todayBookings, upcomingBookings } = useMemo(() => {
    const qn = q.trim().toLowerCase()

    const matchesQ = (b: Booking) =>
      !qn ||
      b.code.toLowerCase().includes(qn) ||
      (names.get(b.patientId) ?? '').toLowerCase().includes(qn) ||
      b.service.toLowerCase().includes(qn) ||
      (b.resource ?? '').toLowerCase().includes(qn)

    const items = BOOKINGS
      .map(b => ({ ...b, startD: new Date(b.start), endD: new Date(b.end) }))
      .sort((a, b) => a.startD.getTime() - b.startD.getTime())

    const today = items.filter(b => isSameLocalDay(b.startD, now) && matchesQ(b))
    const upcoming = items.filter(b => !isSameLocalDay(b.startD, now) && b.startD >= startOfDay(now) && matchesQ(b))

    return { todayBookings: today, upcomingBookings: upcoming }
  }, [q, now, names])

  const upcomingFiltered = useMemo(() => {
    if (status === 'all') return upcomingBookings
    return upcomingBookings.filter(b => b.status === status)
  }, [upcomingBookings, status])

  return (
    <div className="space-y-10">
      {/* Header matches Patients (nice mobile stacking) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Bookings</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Search – full width on mobile */}
          <div className="relative sm:w-auto">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all bookings…"
              className="w-full sm:w-64 rounded-lg bg-surface pl-8 pr-3 py-2 text-sm text-ink outline-none placeholder:text-ink/50"
            />
          </div>

          {/* Status filter – same visual rhythm as Patients controls */}
          <div className="relative sm:w-auto">
            <FunnelIcon className="pointer-events-none absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              title="Filter upcoming by status"
              className="w-full sm:w-auto rounded-lg border border-brand-300/50 bg-surface pl-8 pr-8 py-2 text-sm text-ink outline-none"
            >
              <option value="all">All statuses (upcoming)</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="no-show">No show</option>
            </select>
          </div>

          {/* Primary CTA – matches Patients */}
          <button className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none">
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
                <tr>
                  <Th>Code</Th>
                  <Th>Patient</Th>
                  <Th>Service</Th>
                  <Th>Resource</Th>
                  <Th>Start</Th>
                  <Th>End</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>
              <TBody>
                {todayBookings.map((b) => (
                  <Tr key={b.id}>
                    <Td className="font-medium text-ink">{b.code}</Td>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>
                    <Td>{b.service}</Td>
                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>
                    <Td className="text-ink/70">{dt.format(new Date(b.start))}</Td>
                    <Td className="text-ink/70">{dt.format(new Date(b.end))}</Td>
                    <Td>
                      {/* Dot + label (label hidden on xs, visible ≥ sm) */}
                      <StatusBadge status={b.status} showText />
                    </Td>
                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => console.log('view booking', b.id)}
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
        <div className="md:hidden space-y-3">
          {todayBookings.length === 0 && (
            <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
              No bookings today.
            </div>
          )}
          {todayBookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-ink">{names.get(b.patientId) ?? 'Unknown'}</div>
                  <div className="mb-1 text-xs text-ink/70">{b.code}</div>
                  <div className="text-sm text-ink/70">{b.service} · {b.resource ?? '—'}</div>
                </div>
                {/* Dot only on mobile header */}
                <StatusBadge status={b.status} showText={false} />
              </div>
              <div className="mt-2 text-sm text-ink/70">
                <div>Start: {dt.format(new Date(b.start))}</div>
                <div>End: {dt.format(new Date(b.end))}</div>
              </div>
              {b.notes && <p className="mt-2 text-sm text-ink/60">{b.notes}</p>}
              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => console.log('view booking', b.id)}
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
      <Collapsible title="Upcoming" count={upcomingBookings.length} defaultOpen>
        {/* Table (md+) using shared primitives */}
        <div className="hidden md:block">
          <TableFrame>
            <TableEl>
              <THead>
                <tr>
                  <Th>Code</Th>
                  <Th>Patient</Th>
                  <Th>Service</Th>
                  <Th>Resource</Th>
                  <Th>Start</Th>
                  <Th>End</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </THead>

              <TBody>
                {upcomingFiltered.map((b) => (
                  <Tr key={b.id}>
                    <Td className="font-medium text-ink">{b.code}</Td>
                    <Td>{names.get(b.patientId) ?? 'Unknown'}</Td>
                    <Td>{b.service}</Td>
                    <Td className="text-ink/70">{b.resource ?? '—'}</Td>
                    <Td className="text-ink/70">{dt.format(new Date(b.start))}</Td>
                    <Td className="text-ink/70">{dt.format(new Date(b.end))}</Td>
                    <Td>
                      <StatusBadge status={b.status} showText />
                    </Td>
                    <Td className="text-right">
                      <BookingActionButtons
                        onView={() => console.log('view booking', b.id)}
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
        <div className="md:hidden space-y-3">
          {upcomingFiltered.length === 0 && (
            <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
              No upcoming bookings found.
            </div>
          )}
          {upcomingFiltered.map((b) => (
            <div key={b.id} className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-ink">{names.get(b.patientId) ?? 'Unknown'}</div>
                  <div className="mb-1 text-xs text-ink/70">{b.code}</div>
                  <div className="text-sm text-ink/70">{b.service} · {b.resource ?? '—'}</div>
                </div>
                <StatusBadge status={b.status} showText={false} />
              </div>
              <div className="mt-2 text-sm text-ink/70">
                <div>Start: {dt.format(new Date(b.start))}</div>
                <div>End: {dt.format(new Date(b.end))}</div>
              </div>
              {b.notes && <p className="mt-2 text-sm text-ink/60">{b.notes}</p>}
              <div className="mt-3 flex justify-end">
                <BookingActionButtons
                  onView={() => console.log('view booking', b.id)}
                  onReschedule={() => console.log('reschedule', b.id)}
                  onNoShow={() => console.log('set no-show', b.id)}
                  onCancel={() => console.log('cancel', b.id)}
                  onDelete={() => console.log('delete booking', b.id)}
                />
              </div>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
