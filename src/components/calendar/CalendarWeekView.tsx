
'use client'

import { cn } from '@/lib/cn'
import { formatDayNumber, formatTime, formatWeekday, getEventsForDate, getVisibleHourRange, getWeekDays, hourLabel, isSameDay, type CalendarBookingEvent } from '@/lib/calendar'

type Props = {
  cursorDate: Date
  selectedDate: Date
  eventsByDate: Record<string, CalendarBookingEvent[]>
  onSelectDate: (date: Date) => void
  onOpenBooking: (event: CalendarBookingEvent) => void
}

const HOUR_HEIGHT = 60

export function CalendarWeekView({ cursorDate, selectedDate, eventsByDate, onSelectDate, onOpenBooking }: Props) {
  const days = getWeekDays(cursorDate)
  const allWeekEvents = days.flatMap(day => getEventsForDate(eventsByDate, day))
  const { startHour, endHour } = getVisibleHourRange(allWeekEvents)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  const totalMinutes = (endHour - startHour) * 60
  const today = new Date()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-2 md:hidden">
        {days.map(day => (
          <button
            key={day.toISOString()}
            type="button"
            onClick={() => onSelectDate(day)}
            className={cn('rounded-2xl border px-2 py-3 text-center shadow-sm', isSameDay(day, selectedDate) ? 'border-brand-300 bg-brand-300/15 text-brand-700' : 'border-brand-300/30 bg-surface text-ink')}
          >
            <div className="text-[11px] uppercase tracking-wide text-ink/55">{formatWeekday(day)}</div>
            <div className={cn('mt-2 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold', isSameDay(day, today) && !isSameDay(day, selectedDate) && 'bg-brand-700 text-white')}>{formatDayNumber(day)}</div>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-300/30 bg-surface shadow-sm">
        <div className="md:hidden">
          <MobileWeekDay events={getEventsForDate(eventsByDate, selectedDate)} startHour={startHour} endHour={endHour} totalMinutes={totalMinutes} onOpenBooking={onOpenBooking} />
        </div>

        <div className="hidden md:block overflow-x-auto">
          <div className="min-w-[56rem]">
            <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-brand-300/20 bg-canvas/30">
              <div />
              {days.map(day => (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={cn('flex flex-col items-center gap-1 border-l border-brand-300/20 px-2 py-3 text-sm', isSameDay(day, selectedDate) && 'bg-brand-300/10')}
                >
                  <span className="text-ink/60">{formatWeekday(day)}</span>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-full font-semibold text-ink', isSameDay(day, today) && 'bg-brand-700 text-white')}>{formatDayNumber(day)}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
              <div className="border-r border-brand-300/20 bg-canvas/30">
                {hours.slice(0, -1).map(hour => (
                  <div key={hour} className="relative border-b border-brand-300/10 pr-2 text-right" style={{ height: HOUR_HEIGHT }}>
                    <span className="absolute -top-2 right-2 bg-canvas/30 px-1 text-[11px] text-ink/50">{hourLabel(hour)}</span>
                  </div>
                ))}
              </div>

              {days.map(day => {
                const events = getEventsForDate(eventsByDate, day)
                return (
                  <div key={day.toISOString()} className="relative border-l border-brand-300/20" style={{ height: totalMinutes / 60 * HOUR_HEIGHT }}>
                    {hours.slice(0, -1).map(hour => <div key={hour} className="border-b border-brand-300/10" style={{ height: HOUR_HEIGHT }} />)}
                    {events.map(event => {
                      const top = ((event.startMinutes - startHour * 60) / totalMinutes) * 100
                      const height = Math.max(((event.endMinutes - event.startMinutes) / totalMinutes) * 100, 7)
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onOpenBooking(event)}
                          className={cn('absolute left-1.5 right-1.5 overflow-hidden rounded-xl border px-2 py-1.5 text-left text-xs shadow-sm transition', event.booking.status === 'completed' && 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', event.booking.status === 'cancelled' && 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100', event.booking.status === 'no-show' && 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100', event.booking.status === 'in-progress' && 'border-brand-300 bg-brand-300/15 text-brand-700 hover:bg-brand-300/25', (event.booking.status === 'confirmed' || event.booking.status === 'pending') && 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100')}
                          style={{ top: `calc(${top}% + 2px)`, height: `calc(${height}% - 4px)` }}
                        >
                          <p className="truncate font-medium">{event.title}</p>
                          <p className="mt-0.5 truncate opacity-90">{event.patientName}</p>
                          <p className="mt-0.5 opacity-75">{formatTime(event.start)}</p>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type MobileProps = {
  events: CalendarBookingEvent[]
  startHour: number
  endHour: number
  totalMinutes: number
  onOpenBooking: (event: CalendarBookingEvent) => void
}

function MobileWeekDay({ events, startHour, endHour, totalMinutes, onOpenBooking }: MobileProps) {
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[22rem] grid grid-cols-[4rem_1fr]">
        <div className="border-r border-brand-300/20 bg-canvas/30">
          {hours.slice(0, -1).map(hour => (
            <div key={hour} className="relative border-b border-brand-300/10 pr-2 text-right" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-2 bg-canvas/30 px-1 text-[11px] text-ink/50">{hourLabel(hour)}</span>
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: totalMinutes / 60 * HOUR_HEIGHT }}>
          {hours.slice(0, -1).map(hour => <div key={hour} className="border-b border-brand-300/10" style={{ height: HOUR_HEIGHT }} />)}
          {events.map(event => {
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
                <p className="mt-1 truncate text-xs opacity-90">{event.patientName}</p>
                <p className="mt-1 text-xs opacity-75">{formatTime(event.start)} – {formatTime(event.end)}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
