
import type { Booking } from '@/models/booking'

export type CalendarView = 'day' | 'week' | 'month' | 'year'

export type CalendarBookingEvent = {
  id: string
  booking: Booking
  title: string
  patientName: string
  start: Date
  end: Date
  dateKey: string
  startMinutes: number
  endMinutes: number
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' })
const longDateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const weekdayNarrowFmt = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const dayNumberFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const monthDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

export function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

export function addDays(value: Date, amount: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + amount)
  return next
}

export function addMonths(value: Date, amount: number) {
  const next = new Date(value)
  next.setMonth(next.getMonth() + amount)
  return next
}

export function addYears(value: Date, amount: number) {
  const next = new Date(value)
  next.setFullYear(next.getFullYear() + amount)
  return next
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function startOfWeek(value: Date) {
  const next = startOfDay(value)
  const jsDay = next.getDay()
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay
  return addDays(next, mondayOffset)
}

export function formatDateKey(value: Date) {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatHeaderLabel(view: CalendarView, value: Date) {
  if (view === 'day') return longDateFmt.format(value)
  if (view === 'week') {
    const start = startOfWeek(value)
    const end = addDays(start, 6)
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${monthFmt.format(start)} · ${start.getDate()}–${end.getDate()}`
    }
    if (start.getFullYear() === end.getFullYear()) {
      return `${monthDayFmt.format(start)} – ${monthDayFmt.format(end)}, ${start.getFullYear()}`
    }
    return `${monthDayFmt.format(start)}, ${start.getFullYear()} – ${monthDayFmt.format(end)}, ${end.getFullYear()}`
  }
  if (view === 'year') return yearFmt.format(value)
  return monthFmt.format(value)
}

export function getDateRangeLabel(start: Date, end: Date) {
  if (isSameDay(start, end)) {
    return `${timeFmt.format(start)} – ${timeFmt.format(end)}`
  }
  return `${monthDayFmt.format(start)} ${timeFmt.format(start)} – ${monthDayFmt.format(end)} ${timeFmt.format(end)}`
}

export function getWeekDays(value: Date) {
  const start = startOfWeek(value)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function getMonthGrid(value: Date) {
  const firstOfMonth = new Date(value.getFullYear(), value.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

export function getYearMonths(value: Date) {
  return Array.from({ length: 12 }, (_, index) => new Date(value.getFullYear(), index, 1))
}

export function formatWeekday(value: Date) {
  return weekdayFmt.format(value)
}

export function formatWeekdayNarrow(value: Date) {
  return weekdayNarrowFmt.format(value)
}

export function formatDayNumber(value: Date) {
  return dayNumberFmt.format(value)
}

export function formatMonthShort(value: Date) {
  return monthShortFmt.format(value)
}

export function formatTime(value: Date) {
  return timeFmt.format(value)
}

export function minutesSinceStartOfDay(value: Date) {
  return value.getHours() * 60 + value.getMinutes()
}

export function toCalendarEvents(bookings: Booking[], patientNames: Map<string, string>) {
  return bookings
    .map((booking): CalendarBookingEvent => {
      const start = new Date(booking.start)
      const end = new Date(booking.end)
      return {
        id: booking.id,
        booking,
        title: booking.serviceName,
        patientName: patientNames.get(booking.patientId) ?? 'Unknown patient',
        start,
        end,
        dateKey: formatDateKey(start),
        startMinutes: minutesSinceStartOfDay(start),
        endMinutes: minutesSinceStartOfDay(end),
      }
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function groupEventsByDate(events: CalendarBookingEvent[]) {
  return events.reduce<Record<string, CalendarBookingEvent[]>>((acc, event) => {
    ;(acc[event.dateKey] ??= []).push(event)
    return acc
  }, {})
}

export function getEventsForDate(eventsByDate: Record<string, CalendarBookingEvent[]>, date: Date) {
  return eventsByDate[formatDateKey(date)] ?? []
}

export function getVisibleHourRange(events: CalendarBookingEvent[], minHour = 7, maxHour = 19) {
  if (events.length === 0) {
    return { startHour: minHour, endHour: maxHour }
  }

  const rawStart = Math.min(...events.map(event => Math.floor(event.startMinutes / 60)))
  const rawEnd = Math.max(...events.map(event => Math.ceil(event.endMinutes / 60)))

  return {
    startHour: Math.max(0, Math.min(minHour, rawStart - 1)),
    endHour: Math.min(24, Math.max(maxHour, rawEnd + 1)),
  }
}

export function getHourLabels(startHour: number, endHour: number) {
  return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
}

export function hourLabel(hour: number) {
  const sample = new Date()
  sample.setHours(hour, 0, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(sample)
}

export function getEventTone(status: Booking['status']) {
  switch (status) {
    case 'completed':
      return {
        card: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
        accent: 'bg-emerald-500',
        dot: 'bg-emerald-500',
      }
    case 'cancelled':
      return {
        card: 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100',
        accent: 'bg-rose-500',
        dot: 'bg-rose-500',
      }
    case 'no-show':
      return {
        card: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
        accent: 'bg-orange-500',
        dot: 'bg-orange-500',
      }
    case 'in-progress':
      return {
        card: 'border-brand-300 bg-brand-300/15 text-brand-700 hover:bg-brand-300/25',
        accent: 'bg-brand-700',
        dot: 'bg-brand-700',
      }
    case 'pending':
      return {
        card: 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100',
        accent: 'bg-violet-500',
        dot: 'bg-violet-500',
      }
    default:
      return {
        card: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100',
        accent: 'bg-sky-500',
        dot: 'bg-sky-500',
      }
  }
}
