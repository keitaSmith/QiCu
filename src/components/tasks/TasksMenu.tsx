'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  PlayCircleIcon,
  UserMinusIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

import type { Booking } from '@/models/booking'
import { dateFmt as dt, timeFmt } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { BOOKINGS_CHANGED_EVENT, emitBookingsChanged } from '@/lib/booking-events'

type TaskKind = 'ready-to-start' | 'needs-status' | 'begin-note' | 'write-note' | 'finish-visit'

type TaskBooking = {
  booking: Booking
  kind: TaskKind
}

type Props = {
  patientNameForId: (patientId: string) => string
  onCreateSession: (booking: Booking) => void
}

async function fetchBookings(): Promise<Booking[]> {
  const res = await fetch('/api/bookings', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load bookings')
  return res.json()
}

async function patchBookingStatus(bookingId: string, status: Booking['status']) {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update booking')
  }
  return res.json() as Promise<Booking>
}

function taskMeta(kind: TaskKind) {
  switch (kind) {
    case 'ready-to-start':
      return {
        title: 'Ready to start visit',
        badge: 'Visit',
        tone: 'bg-emerald-100 text-emerald-800',
      }
    case 'needs-status':
      return {
        title: 'Set outcome',
        badge: 'Outcome',
        tone: 'bg-amber-100 text-amber-800',
      }
    case 'begin-note':
      return {
        title: 'Begin session note',
        badge: 'Note',
        tone: 'bg-sky-100 text-sky-800',
      }
    case 'finish-visit':
      return {
        title: 'Complete visit',
        badge: 'Visit',
        tone: 'bg-emerald-100 text-emerald-800',
      }
    default:
      return {
        title: 'Write session note',
        badge: 'Note',
        tone: 'bg-blue-100 text-blue-800',
      }
  }
}

export function TasksMenu({ patientNameForId, onCreateSession }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadBookings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchBookings()
      setBookings(items)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  useEffect(() => {
    if (!open) return
    loadBookings()
  }, [open, loadBookings])

  useEffect(() => {
    const onChanged = () => {
      loadBookings().catch(() => null)
    }
    window.addEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
  }, [loadBookings])

  const tasks = useMemo(() => {
    const now = new Date()
    const items: TaskBooking[] = []

    for (const b of bookings) {
      const start = new Date(b.start)
      const end = new Date(b.end)
      const hasStarted = !Number.isNaN(start.getTime()) && start.getTime() <= now.getTime()
      const isPast = !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()
      const isCurrent = hasStarted && !isPast

      if (b.status === 'confirmed' && isCurrent) {
        items.push({ booking: b, kind: 'ready-to-start' })
        continue
      }

      if (b.status === 'confirmed' && isPast) {
        items.push({ booking: b, kind: 'needs-status' })
        continue
      }

      if (b.status === 'in-progress' && !b.sessionId) {
        items.push({ booking: b, kind: 'begin-note' })
        continue
      }

      if (b.status === 'in-progress' && b.sessionId && isPast) {
        items.push({ booking: b, kind: 'finish-visit' })
        continue
      }

      if (b.status === 'completed' && !b.sessionId) {
        items.push({ booking: b, kind: 'write-note' })
      }
    }

    items.sort((a, c) => new Date(a.booking.start).getTime() - new Date(c.booking.start).getTime())
    return items
  }, [bookings])

  const badgeCount = tasks.length

  async function setStatus(booking: Booking, status: Booking['status']) {
    try {
      setError(null)
      const updated = await patchBookingStatus(booking.id, status)
      setBookings(prev => prev.map(b => (b.id === updated.id ? updated : b)))
      emitBookingsChanged()
      return updated
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update booking')
      return null
    }
  }

  async function handleStartVisit(booking: Booking) {
    const updated = await setStatus(booking, 'in-progress')
    if (updated) onCreateSession(updated)
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
          <p className="text-sm font-semibold text-ink">Tasks</p>
          <span className="rounded-full bg-brand-300/20 px-2 py-1 text-xs font-semibold text-brand-800">
            {badgeCount}
          </span>
        </div>

        {error && (
          <div className="mx-2 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && <div className="px-3 py-4 text-sm text-ink/60">Loading…</div>}

        {!loading && tasks.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-ink/60">No tasks right now.</div>
        )}

        <div className="max-h-[26rem] overflow-y-auto">
          {tasks.map(t => {
            const b = t.booking
            const start = new Date(b.start)
            const patientName = patientNameForId(b.patientId)
            const meta = taskMeta(t.kind)
            const subtitle = `${patientName} · ${dt.format(start)} · ${timeFmt.format(start)}`

            return (
              <div
                key={`${t.kind}:${b.id}`}
                className="mx-2 my-2 rounded-2xl border border-brand-300/30 bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{meta.title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink/60">{subtitle}</p>
                    <p className="mt-1 truncate text-xs text-ink/70">
                      {b.serviceName} · {b.code}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', meta.tone)}>
                    {meta.badge}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  {t.kind === 'ready-to-start' && (
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          type="button"
                          onClick={() => handleStartVisit(b)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600',
                            focus && 'outline-none ring-2 ring-brand-600',
                          )}
                        >
                          <PlayCircleIcon className="size-4" />
                          Start visit
                        </button>
                      )}
                    </MenuItem>
                  )}

                  {t.kind === 'needs-status' && (
                    <>
                      <MenuItem>
                        {({ focus }) => (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Mark this booking as completed?')) setStatus(b, 'completed')
                            }}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600',
                              focus && 'outline-none ring-2 ring-brand-600',
                            )}
                          >
                            <CheckCircleIcon className="size-4" />
                            Completed
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ focus }) => (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm('Mark this booking as no-show?')) setStatus(b, 'no-show')
                            }}
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
                            onClick={() => {
                              if (window.confirm('Mark this booking as cancelled?')) setStatus(b, 'cancelled')
                            }}
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
                  )}

                  {t.kind === 'finish-visit' && (
                    <MenuItem>
                      {({ focus }) => (
                        <button
                          type="button"
                          onClick={() => void setStatus(b, 'completed')}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600',
                            focus && 'outline-none ring-2 ring-brand-600',
                          )}
                        >
                          <CheckCircleIcon className="size-4" />
                          Complete visit
                        </button>
                      )}
                    </MenuItem>
                  )}

                  {(t.kind === 'begin-note' || t.kind === 'write-note') && (
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
                          {t.kind === 'begin-note' ? 'Begin note' : 'Write note'}
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
