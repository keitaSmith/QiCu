
'use client'

import type { CalendarBookingEvent } from '@/lib/calendar'
import { formatTime, getEventTone } from '@/lib/calendar'

type Props = {
  events: CalendarBookingEvent[]
  emptyText: string
  onOpenBooking: (event: CalendarBookingEvent) => void
}

export function CalendarEventList({ events, emptyText, onOpenBooking }: Props) {
  if (events.length === 0) {
    return <div className="rounded-2xl border border-dashed border-brand-300/40 bg-surface px-4 py-8 text-center text-sm text-ink/60">{emptyText}</div>
  }

  return (
    <ol className="space-y-3">
      {events.map(event => {
        const tone = getEventTone(event.booking.status)
        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onOpenBooking(event)}
              className={`group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition ${tone.card}`}
            >
              <span className={`mt-1 h-9 w-1.5 rounded-full ${tone.accent}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-xs opacity-80">{formatTime(event.start)} – {formatTime(event.end)}</p>
                </div>
                <p className="mt-1 truncate text-sm opacity-90">{event.patientName}</p>
                {event.booking.resource ? <p className="mt-1 text-xs opacity-80">{event.booking.resource}</p> : null}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
