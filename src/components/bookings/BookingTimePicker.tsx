'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import type { Booking } from '@/models/booking'
import { cn } from '@/lib/cn'
import { timeFmt } from '@/lib/dates'
import { useIsDesktop } from '@/lib/useIsDesktop'

export type BookingTimePickerProps = {
  label?: string
  /** "YYYY-MM-DDTHH:MM" or null */
  value: string | null
  onChange: (value: string | null) => void
  serviceDurationMinutes: number | null | undefined
  existingBookings: Booking[]
}

const WORK_DAY_START_HOUR = 9
const WORK_DAY_END_HOUR = 17
const SLOT_INTERVAL_MINUTES = 15

type MonthYear = { year: number; monthIndex: number }

const SLOT_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function BookingTimePicker({
  label,
  value,
  onChange,
  serviceDurationMinutes,
  existingBookings,
}: BookingTimePickerProps) {
  const duration = serviceDurationMinutes ?? null
  const isDesktop = useIsDesktop()

  const today = useMemo(() => startOfDay(new Date()), [])

  const selectedDateTime = useMemo(
    () => (value ? parseLocalDateTime(value) : null),
    [value],
  )

  const initialSelectedDate = useMemo(() => {
    if (selectedDateTime) {
      return startOfDay(selectedDateTime)
    }
    if (!duration) {
      return today
    }
    const next = findFirstAvailableDate(new Date(), existingBookings, duration)
    return next ?? today
  }, [selectedDateTime, today, duration, existingBookings])

  const [monthYear, setMonthYear] = useState<MonthYear>(() => ({
    year: initialSelectedDate.getFullYear(),
    monthIndex: initialSelectedDate.getMonth(),
  }))
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    initialSelectedDate,
  )
  const [isOpen, setIsOpen] = useState(false)

  // mobile-only: after selecting a date, hide calendar and show slots only
  const [showSlotsOnlyMobile, setShowSlotsOnlyMobile] = useState(false)

  // keep calendar in sync when external value changes
  useEffect(() => {
    if (!selectedDateTime) return
    const d = startOfDay(selectedDateTime)
    setSelectedDate(d)
    setMonthYear({ year: d.getFullYear(), monthIndex: d.getMonth() })
    // when value is driven externally, default back to calendar view on mobile
    setShowSlotsOnlyMobile(false)
  }, [selectedDateTime])

  // reset slot-only view when duration changes (e.g. service changed)
  useEffect(() => {
    if (!duration) {
      setShowSlotsOnlyMobile(false)
    }
  }, [duration])

  const daysMatrix = useMemo(
    () => getCalendarMatrix(monthYear.year, monthYear.monthIndex),
    [monthYear.year, monthYear.monthIndex],
  )

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDate || !duration) return []
    return generateSlotsForDay(selectedDate, existingBookings, duration)
  }, [selectedDate, existingBookings, duration])

  const fieldDisplay = selectedDateTime
    ? `${selectedDateTime.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      })} • ${timeFmt.format(selectedDateTime)}`
    : 'Select date & time'

  const serviceMissing = !duration

  const handleDayClick = (day: Date) => {
    if (isPastDay(day, today)) return
    setSelectedDate(day)
    // clear time when changing date
    onChange(null)

    if (!isDesktop && duration) {
      const slots = generateSlotsForDay(day, existingBookings, duration)
      // only switch to slots-only if there are actually slots
      setShowSlotsOnlyMobile(slots.length > 0)
    }
  }

  const handleSlotClick = (start: Date) => {
    const iso = toLocalDatetimeInputValue(start)
    onChange(iso)
    setIsOpen(false)
    setShowSlotsOnlyMobile(false)
  }

  const goToPrevMonth = () => {
    setMonthYear(prev => {
      const m = prev.monthIndex - 1
      if (m < 0) return { year: prev.year - 1, monthIndex: 11 }
      return { year: prev.year, monthIndex: m }
    })
  }

  const goToNextMonth = () => {
    setMonthYear(prev => {
      const m = prev.monthIndex + 1
      if (m > 11) return { year: prev.year + 1, monthIndex: 0 }
      return { year: prev.year, monthIndex: m }
    })
  }

  const monthLabel = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(monthYear.year, monthYear.monthIndex, 1))

  const weekdayLabels = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

  const renderCalendar = () => (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold text-ink">{monthLabel}</div>
        <button
          type="button"
          onClick={goToNextMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-[0.72rem] font-medium uppercase tracking-wide text-brand-700">
        {weekdayLabels.map(d => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 rounded-lg">
        {daysMatrix.map((week, w) => (
          <div key={w} className="contents">
            {week.map((day, idx) => {
              if (!day) {
                return (
                  <div key={`empty-${w}-${idx}`} className="h-9 md:h-10" />
                )
              }

              const isPast = isPastDay(day, today)
              const isSelected =
                selectedDate && isSameLocalDay(day, selectedDate)
              const hasAvailability =
                !!duration &&
                generateSlotsForDay(day, existingBookings, duration).length > 0

              const isFull = !!(duration && !isPast && !hasAvailability)
              const disabled = isPast || !hasAvailability

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => !disabled && handleDayClick(day)}
                  disabled={disabled}
                  className={cn(
                    'flex h-9 md:h-10 items-center justify-center rounded-md text-sm transition',
                    'text-ink/80 hover:bg-brand-300/20',
                    !isSelected && 'bg-surface',
                    isFull && 'bg-ink/5 text-ink/40',
                    isSelected &&
                      'bg-brand-700 text-surface font-semibold hover:text-ink',
                    disabled && 'cursor-default opacity-20 text-ink/30 hover:bg-transparent bg-transparent',
                  )}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/60">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-brand-700" />
          Selected
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-ink/10" />
          Full
        </span>
      </div>
    </div>
  )

  const renderSlots = () => {
    if (serviceMissing) {
      return (
        <p className="text-xs text-ink/50">
          Select a service first to see available time slots.
        </p>
      )
    }

    if (!selectedDate) {
      return (
        <p className="text-xs text-ink/50">
          Select a day in the calendar to see available time slots.
        </p>
      )
    }

    if (slotsForSelectedDay.length === 0) {
      return (
        <p className="text-xs text-ink/50">
          No available slots on this day. Choose another date.
        </p>
      )
    }

    return (
      <>
        <p className="mb-1 text-xs text-ink/60">
          Available on{' '}
          {selectedDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </p>
        <div className="flex max-h-80 flex-wrap gap-2 overflow-y-auto pr-1 text-sm">
          {slotsForSelectedDay.map(slotStart => {
            const isSelected =
              selectedDateTime && isSameMinute(slotStart, selectedDateTime)

            return (
              <button
                key={slotStart.getTime()}
                type="button"
                onClick={() => handleSlotClick(slotStart)}
                className={cn(
                  'rounded-md px-2 py-1 text-[0.8rem] tabular-nums',
                  'border border-ink/10 text-ink/80 hover:border-brand-500 hover:text-brand-900',
                  isSelected &&
                    'border-brand-700 bg-brand-700 text-surface hover:border-brand-700 hover:text-surface',
                )}
              >
                {SLOT_TIME_FMT.format(slotStart)}
              </button>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-xs text-ink/60">
          {label}
        </label>
      )}

      {/* field wrapper – same style as DateTimeField */}
      <div
        className={cn(
          'border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm',
          'focus-within:border-brand-300',
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setIsOpen(open => {
                const next = !open
                if (!next) {
                  setShowSlotsOnlyMobile(false)
                }
                return next
              })
            }}
            className={cn(
              'flex w-full items-center justify-between bg-transparent text-left text-sm text-ink',
              'outline-none focus:outline-none',
            )}
          >
            <span
              className={cn(
                'truncate tabular-nums',
                !value && 'text-ink/50',
              )}
            >
              {fieldDisplay}
            </span>
            <CalendarDaysIcon className="h-4 w-4 text-ink/50" />
          </button>

          {isOpen && (
            <div
              className={cn(
                'absolute z-20 mt-1 rounded-xl border border-brand-300 bg-surface p-3 shadow-lg',
                // mobile: centered & constrained to viewport width
                'w-full max-w-[calc(100vw-2rem)] left-1/2 -translate-x-1/2',
                // desktop: right aligned fixed width
                'sm:left-auto sm:right-0 sm:translate-x-0 sm:w-[470px]',
              )}
            >
              <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto sm:flex-row">
                {isDesktop ? (
                  <>
                    <div className="w-full sm:w-2/3">{renderCalendar()}</div>
                    <div className="w-full sm:w-1/2">{renderSlots()}</div>
                  </>
                ) : showSlotsOnlyMobile && selectedDate ? (
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-ink/60">
                        {selectedDate.toLocaleDateString(undefined, {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <button
                        type="button"
                        className="text-xs font-medium text-brand-700 hover:text-brand-600"
                        onClick={() => setShowSlotsOnlyMobile(false)}
                      >
                        Change date
                      </button>
                    </div>
                    {renderSlots()}
                  </div>
                ) : (
                  <div className="w-full">{renderCalendar()}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- helpers ---------------- */

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isPastDay(day: Date, today: Date) {
  return startOfDay(day).getTime() < startOfDay(today).getTime()
}

function isSameMinute(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  )
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  if (!datePart || !timePart) return null
  const [yearStr, monthStr, dayStr] = datePart.split('-')
  const [hourStr, minuteStr] = timePart.split(':')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (
    Number.isNaN(year) ||
    Number.isNaN(monthIndex) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null
  }
  return new Date(year, monthIndex, day, hour, minute)
}

function toLocalDatetimeInputValue(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function getCalendarMatrix(
  year: number,
  monthIndex: number,
): (Date | null)[][] {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const matrix: (Date | null)[][] = []
  let currentDay = 1 - firstWeekday

  for (let week = 0; week < 6; week++) {
    const row: (Date | null)[] = []
    for (let dow = 0; dow < 7; dow++) {
      if (currentDay < 1 || currentDay > daysInMonth) {
        row.push(null)
      } else {
        row.push(new Date(year, monthIndex, currentDay))
      }
      currentDay++
    }
    matrix.push(row)
  }
  return matrix
}

function generateSlotsForDay(
  date: Date,
  bookings: Booking[],
  durationMinutes: number,
): Date[] {
  const dayStart = new Date(date)
  dayStart.setHours(WORK_DAY_START_HOUR, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(WORK_DAY_END_HOUR, 0, 0, 0)

  const slots: Date[] = []
  const now = new Date()

  for (
    let t = new Date(dayStart);
    t.getTime() + durationMinutes * 60_000 <= dayEnd.getTime();
    t = new Date(t.getTime() + SLOT_INTERVAL_MINUTES * 60_000)
  ) {
    const candidateStart = new Date(t)
    const candidateEnd = new Date(
      candidateStart.getTime() + durationMinutes * 60_000,
    )

    // skip past times on today
    if (
      isSameLocalDay(date, now) &&
      candidateStart.getTime() < now.getTime()
    ) {
      continue
    }

    const overlapsExisting = bookings.some(b => {
      const bStart = parseLocalDateTime(b.start)
      const bEnd = parseLocalDateTime(b.end)
      if (!bStart || !bEnd) return false
      if (!isSameLocalDay(bStart, date)) return false

      return (
        candidateStart.getTime() < bEnd.getTime() &&
        candidateEnd.getTime() > bStart.getTime()
      )
    })

    if (!overlapsExisting) {
      slots.push(candidateStart)
    }
  }

  return slots
}

function findFirstAvailableDate(
  from: Date,
  bookings: Booking[],
  durationMinutes: number,
): Date | null {
  const maxDaysToScan = 90
  const start = startOfDay(from)

  for (let offset = 0; offset < maxDaysToScan; offset++) {
    const day = new Date(start)
    day.setDate(start.getDate() + offset)
    const slots = generateSlotsForDay(day, bookings, durationMinutes)
    if (slots.length > 0) {
      return day
    }
  }

  return null
}
