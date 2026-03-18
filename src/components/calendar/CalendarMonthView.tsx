
'use client'

import { CalendarEventList } from '@/components/calendar/CalendarEventList'
import { cn } from '@/lib/cn'
import { formatDayNumber, formatWeekday, formatWeekdayNarrow, formatTime, getEventTone, getEventsForDate, getMonthGrid, isSameDay, isSameMonth, type CalendarBookingEvent } from '@/lib/calendar'

type Props = {
  cursorDate: Date
  selectedDate: Date
  eventsByDate: Record<string, CalendarBookingEvent[]>
  onSelectDate: (date: Date) => void
  onOpenBooking: (event: CalendarBookingEvent) => void
}

export function CalendarMonthView({ cursorDate, selectedDate, eventsByDate, onSelectDate, onOpenBooking }: Props) {
  const days = getMonthGrid(cursorDate)
  const selectedEvents = getEventsForDate(eventsByDate, selectedDate)
  const today = new Date()

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-brand-300/30 bg-surface shadow-sm">
        <div className="grid grid-cols-7 border-b border-brand-300/20 bg-canvas/50 text-center text-xs font-semibold uppercase tracking-wide text-ink/60">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="py-3 hidden sm:block">{formatWeekday(days[index])}</div>
          ))}
          {Array.from({ length: 7 }, (_, index) => (
            <div key={`m-${index}`} className="py-3 sm:hidden">{formatWeekdayNarrow(days[index])}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-brand-300/20">
          {days.map(day => {
            const events = getEventsForDate(eventsByDate, day)
            const isCurrentMonth = isSameMonth(day, cursorDate)
            const isSelected = isSameDay(day, selectedDate)
            const isToday = isSameDay(day, today)
            return (
              <div key={day.toISOString()} className={cn('min-h-28 bg-surface px-2 py-2 sm:min-h-36 sm:px-3', !isCurrentMonth && 'bg-canvas/30 text-ink/45', isSelected && 'bg-brand-300/10')}>
                <button
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className="flex w-full items-center justify-between gap-2 text-left transition hover:text-brand-700"
                >
                  <span className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-medium text-ink', isToday && 'bg-brand-700 text-white', isSelected && !isToday && 'bg-brand-300/20 text-brand-700')}>{formatDayNumber(day)}</span>
                  {events.length > 0 ? <span className="text-[11px] font-medium text-ink/50">{events.length}</span> : null}
                </button>

                <div className="mt-2 hidden space-y-1.5 sm:block">
                    {events.slice(0, 3).map(event => {
                      const tone = getEventTone(event.booking.status)
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onOpenBooking(event)}
                          className={cn('flex w-full items-center gap-2 rounded-lg border px-2 py-1 text-left text-xs shadow-sm', tone.card)}
                        >
                          <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
                          <span className="min-w-0 flex-1 truncate">{event.patientName}</span>
                          <span className="shrink-0 opacity-75">{formatTime(event.start)}</span>
                        </button>
                      )
                    })}
                    {events.length > 3 ? <p className="px-1 text-xs text-ink/50">+{events.length - 3} more</p> : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1 sm:hidden">
                    {events.slice(0, 3).map(event => {
                      const tone = getEventTone(event.booking.status)
                      return <span key={event.id} className={cn('h-2.5 w-2.5 rounded-full', tone.dot)} />
                    })}
                  </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="sm:hidden">
        <CalendarEventList events={selectedEvents} emptyText="No bookings for this day." onOpenBooking={onOpenBooking} />
      </div>
    </div>
  )
}
