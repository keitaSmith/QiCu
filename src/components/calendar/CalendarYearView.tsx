
'use client'

import { cn } from '@/lib/cn'
import { formatDayNumber, formatWeekdayNarrow, getEventsForDate, getMonthGrid, getYearMonths, isSameDay, isSameMonth, type CalendarBookingEvent } from '@/lib/calendar'

type Props = {
  cursorDate: Date
  selectedDate: Date
  eventsByDate: Record<string, CalendarBookingEvent[]>
  onSelectDate: (date: Date) => void
}

export function CalendarYearView({ cursorDate, selectedDate, eventsByDate, onSelectDate }: Props) {
  const today = new Date()
  const months = getYearMonths(cursorDate)

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {months.map(month => {
        const days = getMonthGrid(month)
        return (
          <section key={month.toISOString()} className="overflow-hidden rounded-2xl border border-brand-300/30 bg-surface p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{month.toLocaleDateString(undefined, { month: 'long' })}</h2>
              <p className="text-xs text-ink/50">{days.filter(day => getEventsForDate(eventsByDate, day).length > 0 && isSameMonth(day, month)).length} busy days</p>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] uppercase tracking-wide text-ink/45">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="py-2">{formatWeekdayNarrow(days[index])}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                const eventCount = getEventsForDate(eventsByDate, day).length
                const isCurrentMonth = isSameMonth(day, month)
                const isSelected = isSameDay(day, selectedDate)
                const isToday = isSameDay(day, today)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => onSelectDate(day)}
                    className={cn('relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition', isCurrentMonth ? 'bg-canvas/35 text-ink hover:bg-brand-300/10' : 'text-ink/30', isSelected && 'bg-brand-300/15 text-brand-700 ring-1 ring-brand-300/50')}
                  >
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-full font-medium', isToday && 'bg-brand-700 text-white')}>{formatDayNumber(day)}</span>
                    {eventCount > 0 ? <span className="mt-1 flex items-center gap-0.5">{Array.from({ length: Math.min(eventCount, 3) }, (_, index) => <span key={index} className="h-1.5 w-1.5 rounded-full bg-brand-600" />)}</span> : null}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
