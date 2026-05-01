'use client'

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
import { useTasks, type TaskKind } from '@/hooks/useTasks'
import { useBookings } from '@/hooks/useBookings'
import { TaskSkeleton } from '@/components/tasks/TaskSkeleton'

type Props = {
  patientNameForId: (patientId: string) => string
  onCreateSession: (booking: Booking) => void
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
  const { bookings, loading, error, refresh, updateBookingStatus } = useBookings()

  const tasks = useTasks(bookings)

  const badgeCount = tasks.length

  async function setStatus(booking: Booking, status: Booking['status']) {
    return updateBookingStatus(booking.id, status)
  }

  async function handleStartVisit(booking: Booking) {
    const updated = await setStatus(booking, 'in-progress')
    if (updated) onCreateSession(updated)
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        onClick={() => {
          refresh().catch(() => null)
        }}
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

        {loading && <TaskSkeleton items={3} />}

        {!loading && tasks.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-ink/60">No tasks right now.</div>
        )}

        <div className="max-h-[26rem] overflow-y-auto">
          {tasks.map(t => {
            const b = t.booking
            const start = new Date(b.start)
            const end = new Date(b.end)
            const isOverdue =
              t.kind === 'write-note' &&
              !Number.isNaN(end.getTime()) &&
              end.getTime() < Date.now()
            const patientName = patientNameForId(b.patientId)
            const meta = taskMeta(t.kind)
            const subtitle = `${patientName} · ${dt.format(start)} · ${timeFmt.format(start)}`

            return (
              <div
                key={`${t.kind}:${b.id}`}
                className={cn(
                  'mx-2 my-2 rounded-2xl border bg-surface p-3',
                  isOverdue
                    ? 'border-amber-300/50 bg-amber-50/50'
                    : 'border-brand-300/30',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{meta.title}</p>
                      {isOverdue && (
                        <span className="rounded-full border border-amber-300/60 bg-amber-100/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                          Overdue
                        </span>
                      )}
                    </div>
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
