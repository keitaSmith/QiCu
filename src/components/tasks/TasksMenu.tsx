'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserMinusIcon,
} from '@heroicons/react/24/outline'

import type { Booking } from '@/models/booking'
import { dateFmt as dt, timeFmt } from '@/lib/dates'
import { cn } from '@/lib/cn'

type TaskBooking = {
  booking: Booking
  kind: 'needs-status' | 'needs-note'
}

type Props = {
  /** Map booking.patientId -> display name (already available in layout) */
  patientNameForId: (patientId: string) => string

  /** Open the create-session dialog pre-linked to this booking */
  onCreateSession: (booking: Booking) => void
}

async function fetchBookings(): Promise<Booking[]> {
  const res = await fetch('/api/bookings', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load bookings')
  return res.json()
}

async function patchBookingStatus(bookingId: string, status: Booking['status']) {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update booking')
  }
  return res.json() as Promise<Booking>
}

export function TasksMenu({ patientNameForId, onCreateSession }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load when dropdown opens (keeps it accurate without heavy polling)
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const items = await fetchBookings()
        if (!alive) return
        setBookings(items)
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? 'Failed to load tasks')
      } finally {
        if (!alive) return
        setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [open])

  const tasks = useMemo(() => {
    const now = new Date()
    const items: TaskBooking[] = []

    for (const b of bookings) {
      const end = new Date(b.end)
      const isPast = !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()
      const preOutcome = b.status === 'pending' || b.status === 'confirmed'

      if (isPast && preOutcome) {
        items.push({ booking: b, kind: 'needs-status' })
        continue
      }

      if (b.status === 'fulfilled' && !b.sessionId) {
        items.push({ booking: b, kind: 'needs-note' })
      }
    }

    // Sort oldest first so the practitioner clears backlog in order
    items.sort(
      (a, c) => new Date(a.booking.start).getTime() - new Date(c.booking.start).getTime(),
    )
    return items
  }, [bookings])

  const badgeCount = tasks.length

  async function setStatus(booking: Booking, status: Booking['status']) {
    try {
      setError(null)
      const updated = await patchBookingStatus(booking.id, status)
      setBookings(prev => prev.map(b => (b.id === updated.id ? updated : b)))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update booking')
    }
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="relative -m-2.5 rounded-md p-2.5 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
      >
        <span className="sr-only">Open tasks</span>
        <ClipboardDocumentCheckIcon aria-hidden="true" className="size-6" />
        {badgeCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-semibold text-white">
            {badgeCount}
          </span>
        )}
      </MenuButton>

      <MenuItems
        transition
        className="absolute right-0 z-50 mt-2.5 w-[26rem] origin-top-right rounded-2xl bg-surface p-2 shadow-lg ring-1 ring-ink/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        <div className="flex items-center justify-between px-2 py-2">
          <div>
            <p className="text-sm font-semibold text-ink">Tasks</p>
            <p className="text-xs text-ink/60">Things that still need action</p>
          </div>
          <span className="rounded-full bg-brand-300/20 px-2 py-1 text-xs font-semibold text-brand-800">
            {badgeCount}
          </span>
        </div>

        {error && (
          <div className="mx-2 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="px-3 py-4 text-sm text-ink/60">Loading…</div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-ink/60">
            No tasks right now.
          </div>
        )}

        <div className="max-h-[26rem] overflow-y-auto">
          {tasks.map(t => {
            const b = t.booking
            const start = new Date(b.start)
            const patientName = patientNameForId(b.patientId)

            const title =
              t.kind === 'needs-status'
                ? 'Set outcome'
                : 'Write session note'

            const subtitle = `${patientName} · ${dt.format(start)} · ${timeFmt.format(start)}`

            return (
              <div
                key={`${t.kind}:${b.id}`}
                className="mx-2 my-2 rounded-2xl border border-brand-300/30 bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink/60">{subtitle}</p>
                    <p className="mt-1 truncate text-xs text-ink/70">
                      {b.serviceName} · {b.code}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                      t.kind === 'needs-status'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800',
                    )}
                  >
                    {t.kind === 'needs-status' ? 'Outcome' : 'Note'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  {t.kind === 'needs-status' ? (
                    <>
                      <MenuItem>
                        {({ focus }) => (
                          <button
                            type="button"
                            onClick={() => setStatus(b, 'fulfilled')}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600',
                              focus && 'outline-none ring-2 ring-brand-600',
                            )}
                          >
                            <CheckCircleIcon className="size-4" />
                            Fulfilled
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ focus }) => (
                          <button
                            type="button"
                            onClick={() => setStatus(b, 'no-show')}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border border-brand-300/50 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-300/10',
                              focus && 'outline-none ring-2 ring-brand-600',
                            )}
                          >
                            <UserMinusIcon className="size-4" />
                            No-show
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ focus }) => (
                          <button
                            type="button"
                            onClick={() => setStatus(b, 'cancelled')}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg border border-brand-300/50 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-300/10',
                              focus && 'outline-none ring-2 ring-brand-600',
                            )}
                          >
                            <XCircleIcon className="size-4" />
                            Cancelled
                          </button>
                        )}
                      </MenuItem>
                    </>
                  ) : (
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          type="button"
                          onClick={() => onCreateSession(b)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600',
                            focus && 'outline-none ring-2 ring-brand-600',
                          )}
                        >
                          <ClipboardDocumentCheckIcon className="size-4" />
                          Create note
                        </button>
                      )}
                    </MenuItem>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </MenuItems>
    </Menu>
  )
}
