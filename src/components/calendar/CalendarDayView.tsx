
'use client'

import { CalendarEventList } from '@/components/calendar/CalendarEventList'
import { cn } from '@/lib/cn'
import { formatTime, getEventsForDate, getVisibleHourRange, hourLabel, type CalendarBookingEvent } from '@/lib/calendar'

type Props = {
  date: Date
  eventsByDate: Record<string, CalendarBookingEvent[]>
  onOpenBooking: (event: CalendarBookingEvent) => void
}

const HOUR_HEIGHT = 72

export function CalendarDayView({ date, eventsByDate, onOpenBooking }: Props) {
  const dayEvents = getEventsForDate(eventsByDate, date)
  const { startHour, endHour } = getVisibleHourRange(dayEvents)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  const totalMinutes = (endHour - startHour) * 60

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-hidden rounded-2xl border border-brand-300/30 bg-surface shadow-sm">
        <div className="border-b border-brand-300/20 px-4 py-3 text-sm font-medium text-ink">Daily schedule</div>
        <div className="overflow-x-auto">
          <div className="min-w-[24rem]">
            <div className="grid grid-cols-[4rem_1fr]">
              <div className="border-r border-brand-300/20 bg-canvas/30" />
              <div className="flex items-center border-b border-brand-300/20 px-4 py-3 text-sm font-medium text-ink">Appointments</div>
            </div>
            <div className="grid grid-cols-[4rem_1fr]">
              <div className="border-r border-brand-300/20 bg-canvas/30">
                {hours.slice(0, -1).map(hour => (
                  <div key={hour} className="relative border-b border-brand-300/10 pr-2 text-right" style={{ height: HOUR_HEIGHT }}>
                    <span className="absolute -top-2 right-2 bg-canvas/30 px-1 text-[11px] text-ink/50">{hourLabel(hour)}</span>
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: totalMinutes / 60 * HOUR_HEIGHT }}>
                {hours.slice(0, -1).map(hour => (
                  <div key={hour} className="border-b border-brand-300/10" style={{ height: HOUR_HEIGHT }} />
                ))}

                {dayEvents.map(event => {
                  const top = ((event.startMinutes - startHour * 60) / totalMinutes) * 100
                  const height = Math.max(((event.endMinutes - event.startMinutes) / totalMinutes) * 100, 8)
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onOpenBooking(event)}
                      className={cn('absolute left-3 right-3 overflow-hidden rounded-2xl border px-3 py-2 text-left shadow-sm transition', event.booking.status === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', event.booking.status === 'cancelled' && 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100', event.booking.status === 'no-show' && 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100', event.booking.status === 'in-progress' && 'border-brand-300 bg-brand-300/15 text-brand-700 hover:bg-brand-300/25', (event.booking.status === 'confirmed' || event.booking.status === 'pending') && 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100')}
                      style={{ top: `calc(${top}% + 4px)`, height: `calc(${height}% - 8px)` }}
                    >
                      <p className="truncate text-sm font-medium">{event.title}</p>
                      <p className="mt-1 truncate text-xs opacity-85">{event.patientName}</p>
                      <p className="mt-1 text-xs opacity-75">{formatTime(event.start)} – {formatTime(event.end)}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-brand-300/30 bg-surface px-4 py-3 shadow-sm">
          <p className="text-sm font-medium text-ink">At a glance</p>
          <p className="mt-1 text-sm text-ink/60">{dayEvents.length} booking{dayEvents.length === 1 ? '' : 's'} scheduled.</p>
        </div>
        <CalendarEventList events={dayEvents} emptyText="No bookings for this day." onOpenBooking={onOpenBooking} />
      </div>
    </div>
  )
}
