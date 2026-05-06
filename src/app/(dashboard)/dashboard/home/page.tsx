'use client'

import Link from 'next/link'
import { useMemo } from 'react'

import { StatusBadge } from '@/components/ui/StatusBadge'
import { useBookings } from '@/hooks/useBookings'
import { usePatients } from '@/hooks/usePatients'
import { useSessions } from '@/hooks/useSessions'
import { useTasks, type TaskKind } from '@/hooks/useTasks'
import { dateFmt, isSameLocalDay, startOfDay, timeFmt } from '@/lib/dates'
import { nameMap } from '@/lib/patients/selectors'

function taskLabel(kind: TaskKind) {
  switch (kind) {
    case 'ready-to-start':
      return 'Ready to start visit'
    case 'needs-status':
      return 'Set booking outcome'
    case 'begin-note':
      return 'Begin session note'
    case 'finish-visit':
      return 'Complete visit'
    default:
      return 'Write session note'
  }
}

function formatCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`
}

function OverviewCard({
  title,
  value,
  subtitle,
  href,
  children,
}: {
  title: string
  value: string
  subtitle: string
  href?: string
  children?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-brand-300/30 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink/70">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
          <p className="mt-2 text-sm text-ink/60">{subtitle}</p>
        </div>
        {href ? (
          <Link
            href={href}
            className="rounded-full bg-brand-300/15 px-3 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-300/25"
          >
            View
          </Link>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-brand-300/40 bg-brand-300/5 px-4 py-5 text-sm text-ink/60">
      {children}
    </div>
  )
}

function LoadingLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-12 rounded-xl bg-brand-300/15 animate-pulse"
        />
      ))}
    </div>
  )
}

export default function DashboardHome() {
  const { bookings, loading: bookingsLoading } = useBookings()
  const { patients, loading: patientsLoading } = usePatients()
  const { sessions, loading: sessionsLoading } = useSessions()

  const patientNames = useMemo(() => nameMap(patients), [patients])
  const openTasks = useTasks(bookings)

  const { todayDate, todayStart, tomorrowStart, weekEnd } = useMemo(() => {
    const now = new Date()
    const dayStart = startOfDay(now)
    const nextDay = new Date(dayStart)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextWeek = new Date(dayStart)
    nextWeek.setDate(nextWeek.getDate() + 7)

    return {
      todayDate: now,
      todayStart: dayStart,
      tomorrowStart: nextDay,
      weekEnd: nextWeek,
    }
  }, [])

  const sortedBookings = useMemo(
    () =>
      [...bookings].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      ),
    [bookings],
  )

  const todaysBookings = useMemo(
    () =>
      sortedBookings.filter((booking) =>
        isSameLocalDay(new Date(booking.start), todayDate),
      ),
    [sortedBookings, todayDate],
  )

  const upcomingBookings = useMemo(
    () =>
      sortedBookings.filter((booking) => {
        const start = new Date(booking.start).getTime()
        return start >= tomorrowStart.getTime() && booking.status !== 'cancelled'
      }),
    [sortedBookings, tomorrowStart],
  )

  const activePatients = useMemo(
    () => patients.filter((patient) => patient.active !== false),
    [patients],
  )

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort(
          (a, b) =>
            new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime(),
        )
        .slice(0, 4),
    [sessions],
  )

  const nextUpcomingBooking = upcomingBookings[0]
  const todaysPreview = todaysBookings.slice(0, 3)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-brand-300/30 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-ink/70">Dashboard overview</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          Keep today’s practice workflow visible.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/65">
          See bookings scheduled for today, note-related tasks, active patients, upcoming appointments, and recent sessions in one place.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-7">
          <OverviewCard
            title="Today’s bookings"
            value={bookingsLoading ? '...' : String(todaysBookings.length)}
            subtitle={
              bookingsLoading
                ? 'Loading today’s schedule.'
                : todaysBookings.length > 0
                  ? formatCount(todaysBookings.length, 'booking scheduled today', 'bookings scheduled today')
                  : 'No bookings scheduled for today.'
            }
            href="/dashboard/bookings"
          >
            {bookingsLoading ? (
              <LoadingLines />
            ) : todaysPreview.length > 0 ? (
              <div className="space-y-3">
                {todaysPreview.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-brand-300/20 bg-canvas/35 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {timeFmt.format(new Date(booking.start))} · {patientNames.get(booking.patientId) ?? booking.patientId}
                      </p>
                      <p className="truncate text-sm text-ink/60">
                        {booking.serviceName}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No bookings scheduled for today.</EmptyState>
            )}
          </OverviewCard>

          <OverviewCard
            title="Open tasks"
            value={bookingsLoading ? '...' : String(openTasks.length)}
            subtitle={
              bookingsLoading
                ? 'Loading action-required items.'
                : openTasks.length > 0
                  ? formatCount(openTasks.length, 'open task', 'open tasks')
                  : 'No open tasks right now.'
            }
            href="/dashboard/bookings"
          >
            {bookingsLoading ? (
              <LoadingLines />
            ) : openTasks.length > 0 ? (
              <div className="space-y-3">
                {openTasks.slice(0, 4).map((task) => (
                  <div
                    key={`${task.kind}:${task.booking.id}`}
                    className="rounded-xl border border-brand-300/20 bg-canvas/35 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {taskLabel(task.kind)}
                        </p>
                        <p className="truncate text-sm text-ink/60">
                          {patientNames.get(task.booking.patientId) ?? task.booking.patientId} · {task.booking.serviceName}
                        </p>
                      </div>
                      <span className="rounded-full bg-brand-300/20 px-2 py-1 text-[11px] font-semibold text-brand-700">
                        {timeFmt.format(new Date(task.booking.start))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No open tasks right now.</EmptyState>
            )}
          </OverviewCard>

          <OverviewCard
            title="Recent sessions"
            value={sessionsLoading ? '...' : String(sessions.length)}
            subtitle={
              sessionsLoading
                ? 'Loading session records.'
                : sessions.length > 0
                  ? formatCount(sessions.length, 'session recorded', 'sessions recorded')
                  : 'Recent session notes will appear here.'
            }
            href="/dashboard/sessions"
          >
            {sessionsLoading ? (
              <LoadingLines />
            ) : recentSessions.length > 0 ? (
              <div className="space-y-3">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-brand-300/20 bg-canvas/35 px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-ink">
                      {patientNames.get(session.patientId) ?? session.patientId}
                    </p>
                    <p className="text-sm text-ink/60">
                      {session.serviceName ?? 'Session record'} · {dateFmt.format(new Date(session.startDateTime))}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>Recent session notes will appear here.</EmptyState>
            )}
          </OverviewCard>
        </div>

        <div className="space-y-6 xl:col-span-5">
          <OverviewCard
            title="Active patients"
            value={patientsLoading ? '...' : String(activePatients.length)}
            subtitle={
              patientsLoading
                ? 'Loading patient list.'
                : formatCount(activePatients.length, 'active patient', 'active patients')
            }
            href="/dashboard/patients"
          />

          <OverviewCard
            title="Upcoming bookings"
            value={bookingsLoading ? '...' : String(upcomingBookings.length)}
            subtitle={
              bookingsLoading
                ? 'Loading upcoming schedule.'
                : upcomingBookings.length > 0
                  ? formatCount(upcomingBookings.length, 'future booking after today', 'future bookings after today')
                  : 'No upcoming bookings after today.'
            }
            href="/dashboard/calendar"
          >
            {bookingsLoading ? (
              <LoadingLines rows={2} />
            ) : nextUpcomingBooking ? (
              <div className="rounded-xl border border-brand-300/20 bg-canvas/35 px-4 py-4">
                <p className="text-sm font-semibold text-ink">Next upcoming booking</p>
                <p className="mt-2 text-sm text-ink">
                  {patientNames.get(nextUpcomingBooking.patientId) ?? nextUpcomingBooking.patientId}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {dateFmt.format(new Date(nextUpcomingBooking.start))} · {timeFmt.format(new Date(nextUpcomingBooking.start))}
                </p>
                <p className="mt-1 text-sm text-ink/60">{nextUpcomingBooking.serviceName}</p>
              </div>
            ) : (
              <EmptyState>No upcoming bookings after today.</EmptyState>
            )}
          </OverviewCard>

          <OverviewCard
            title="This week at a glance"
            value={bookingsLoading ? '...' : String(sortedBookings.filter((booking) => {
              const start = new Date(booking.start).getTime()
              const weekStart = todayStart.getTime()
              return start >= weekStart && start < weekEnd.getTime() && booking.status !== 'cancelled'
            }).length)}
            subtitle="Confirmed, pending, in-progress, completed, and no-show bookings scheduled this week."
            href="/dashboard/bookings"
          >
            {!bookingsLoading && todaysBookings.length === 0 && openTasks.length === 0 ? (
              <EmptyState>Nothing urgent is waiting right now. New bookings and tasks will show up here as the week fills in.</EmptyState>
            ) : null}
          </OverviewCard>
        </div>
      </div>
    </div>
  )
}
