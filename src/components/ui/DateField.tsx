'use client'

import { useEffect, useMemo, useState,useRef } from 'react'
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/cn'

type DateFieldProps = {
  label?: string
  name?: string
  value: string            // internal: YYYY-MM-DD
  onChange: (value: string) => void
  required?: boolean
  helperText?: string
  error?: string   
}

function parseDate(value: string | null) {
  if (!value) return null
  const [yRaw, mRaw, dRaw] = value.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  const d = Number(dRaw)

  if (!y || !m || !d) return null

  const date = new Date(y, m - 1, d)

  // STRICT: reject JS rollovers (e.g. 31-02 → March 3)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null
  }

  return date
}


function formatDate(date: Date | null) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` // YYYY-MM-DD
}

function getDaysMatrix(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  // Monday as first day
  const jsWeekday = firstOfMonth.getDay() // 0=Sun, 1=Mon...
  const offset = (jsWeekday + 6) % 7      // 0=Mon, 6=Sun

  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7
  const cells: (Date | null)[] = []

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - offset + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(null)
    } else {
      cells.push(new Date(year, monthIndex, dayNum))
    }
  }

  return cells
}

// --- helpers for segments (dd / mm / yyyy) ---

type Segments = {
  day: string // "1", "12"
  month: string
  year: string
}

function isoToSegments(iso: string | null | undefined): Segments {
  if (!iso || iso.length !== 10) return { day: '', month: '', year: '' }
  const [y, m, d] = iso.split('-')
  return {
    day: d.replace(/\D/g, '').slice(0, 2),
    month: m.replace(/\D/g, '').slice(0, 2),
    year: y.replace(/\D/g, '').slice(0, 4),
  }
}

function segmentsToIso(segments: Segments): string | '' {
  const { day, month, year } = segments

  // nothing entered
  if (!day && !month && !year) return ''

  // must be fully filled
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return ''

  const iso = `${year}-${month}-${day}`
  const date = parseDate(iso)
  if (!date) return '' // invalid calendar date like 31-02

  // DOB-specific sanity checks
  const today = new Date()
  const minYear = today.getFullYear() - 110 // e.g. 1915 if this year is 2025

  // not in the future
  if (date > today) return ''

  // not older than 110 years
  if (date.getFullYear() < minYear) return ''

  return iso
}


export function DateField({
  label,
  name,
  value,
  onChange,
  required,
  helperText,
  error, 
}: DateFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'days' | 'monthYear'>('days')
  const [isFocused, setIsFocused] = useState(false)
  const [activeSegment, setActiveSegment] = useState<'day' | 'month' | 'year' | null>(null)


  const [segments, setSegments] = useState<Segments>(() => isoToSegments(value))
  const currentIso = segmentsToIso(segments)
const hasAnyDigits = !!(segments.day || segments.month || segments.year)
const isComplete = segments.day.length === 2 && segments.month.length === 2 && segments.year.length === 4
const isInvalid = isComplete && hasAnyDigits && !currentIso

const lastEmittedRef = useRef<string | null>(null)  
useEffect(() => {
  const iso = segmentsToIso(segments)
  // only notify parent if it actually changed
  if (!iso) return

  // same value as last time -> don't spam parent / avoid loops
  if (iso === lastEmittedRef.current) return

  lastEmittedRef.current = iso
  onChange(iso)
}, [segments, onChange])

const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedDate = useMemo(() => parseDate(value || ''), [value])
  const today = useMemo(() => new Date(), [])

  const initialMonthDate = selectedDate ?? today

  const [monthYear, setMonthYear] = useState({
    year: initialMonthDate.getFullYear(),
    monthIndex: initialMonthDate.getMonth(), // 0–11
  })

  // keep segments + month/year in sync if parent value changes
  useEffect(() => {
    setSegments(isoToSegments(value))
    if (selectedDate) {
      setMonthYear({
        year: selectedDate.getFullYear(),
        monthIndex: selectedDate.getMonth(),
      })
    }
  }, [value, selectedDate])

  const days = useMemo(
    () => getDaysMatrix(monthYear.year, monthYear.monthIndex),
    [monthYear.year, monthYear.monthIndex],
  )

  const todayKey = formatDate(today)
  const selectedKey = selectedDate ? formatDate(selectedDate) : null

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }),
    [],
  )

  const monthLabel = monthFormatter.format(
    new Date(monthYear.year, monthYear.monthIndex, 1),
  )

  const weekdayLabels = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

  // Month/year lists for DOB shortcut
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat('en', { month: 'long' }).format(
          new Date(2000, i, 1),
        ),
      ),
    [],
  )

  const years = useMemo(() => {
    const current = today.getFullYear()
    const maxAge = 110
    return Array.from({ length: maxAge + 1 }, (_, i) => current - i)
  }, [today])

  // update a segment & propagate to parent if complete
  function updateSegments(update: (prev: Segments) => Segments) {
  setSegments(prev => update(prev))
}

  function handleDigitInput(digit: string) {
  // fall back to 'day' if nothing is selected yet
  const seg: 'day' | 'month' | 'year' = activeSegment ?? 'day'

  updateSegments(prev => {
    const next: Segments = { ...prev }
    const maxLen = seg === 'year' ? 4 : 2
    const current = next[seg]

    if (current.length >= maxLen) {
      // overwrite when segment is full
      next[seg] = digit
    } else {
      next[seg] = current + digit
    }

    // auto-advance when segment is filled
    const newLen = next[seg].length
    if (newLen === maxLen) {
      if (seg === 'day') setActiveSegment('month')
      else if (seg === 'month') setActiveSegment('year')
    }

    return next
  })
}


  function handleBackspace() {
  const seg: 'day' | 'month' | 'year' = activeSegment ?? 'day'

  updateSegments(prev => {
    const next: Segments = { ...prev }
    const current = next[seg]
    next[seg] = current.slice(0, -1)
    return next
  })
}


  // keyboard handler on the "fake input" box
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const { key } = e

    if (key === 'Tab') return // let browser move focus

    e.preventDefault()

    if (key === 'Backspace') {
      handleBackspace()
      return
    }

    if (key >= '0' && key <= '9') {
      handleDigitInput(key)
      return
    }

    if (key === 'ArrowLeft') {
      setActiveSegment(prev =>
        prev === 'year' ? 'month' : prev === 'month' ? 'day' : 'day',
      )
      return
    }

    if (key === 'ArrowRight') {
      setActiveSegment(prev =>
        prev === 'day' ? 'month' : prev === 'month' ? 'year' : 'year',
      )
      return
    }

    // ignore everything else
  }

  function handleSelectDay(day: Date) {
    const iso = formatDate(day)
    onChange(iso)
    setIsOpen(false)
    setView('days')
  }

  function goToPrevMonth() {
    setMonthYear(prev => {
      const m = prev.monthIndex - 1
      if (m < 0) return { year: prev.year - 1, monthIndex: 11 }
      return { year: prev.year, monthIndex: m }
    })
  }

  function goToNextMonth() {
    setMonthYear(prev => {
      const m = prev.monthIndex + 1
      if (m > 11) return { year: prev.year + 1, monthIndex: 0 }
      return { year: prev.year, monthIndex: m }
    })
  }

  function handleSelectMonth(idx: number) {
    setMonthYear(prev => ({ ...prev, monthIndex: idx }))
  }

  function handleSelectYear(year: number) {
    setMonthYear(prev => ({ ...prev, year }))
  }

  // display text for segments with placeholders
  const dayDisplay =
    segments.day.length === 0
      ? 'dd'
      : segments.day.length === 1
      ? segments.day + 'd'
      : segments.day

  const monthDisplay =
    segments.month.length === 0
      ? 'mm'
      : segments.month.length === 1
      ? segments.month + 'm'
      : segments.month

  const yearDisplay =
    segments.year.length === 0
      ? 'yyyy'
      : segments.year.padEnd(4, 'y')

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs text-ink/60">
          {label}
        </label>
      )}

      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}

      <div className="relative">
        {/* Masked "input" with segment highlighting */}
        <div
  role="textbox"
  tabIndex={0}
  ref={containerRef}                       // 👈 add this
  onKeyDown={handleKeyDown}
  onFocus={() => {
    setIsFocused(true)
  }}
  onBlur={() => setIsFocused(false)}
  onMouseDown={e => {                      // 👈 add this block
    // ensure the container itself gets focus
    if (containerRef.current) {
      containerRef.current.focus()
    }
    // if no segment is active yet, start with 'day'
    if (!activeSegment) {
      setActiveSegment('day')
    }
  }}
  className={cn(
    'flex w-full items-center border-0 border-b bg-transparent pr-6 py-2 text-sm cursor-text select-none outline-none',
  error
    ? 'border-rose-500'                    // error state
    : isFocused
    ? 'border-brand-300'                   // focused state
    : 'border-brand-300/40', 
  )}
>

          <button
            type="button"
            className={cn(
              'tabular-nums rounded px-0.5',
              activeSegment === 'day'
                ? 'bg-brand-700 text-surface font-semibold'
                : 'text-ink/50',
            )}
            onMouseDown={e => {
              e.preventDefault()
              setActiveSegment('day')
            }}
          >
            {dayDisplay}
          </button>

          <span className="mx-1 text-ink/40">-</span>

          <button
            type="button"
            className={cn(
              'tabular-nums rounded px-0.5',
              activeSegment === 'month'
                ? 'bg-brand-700 text-surface font-semibold'
                : 'text-ink/50',
            )}
            onMouseDown={e => {
              e.preventDefault()
              setActiveSegment('month')
            }}
          >
            {monthDisplay}
          </button>

          <span className="mx-1 text-ink/40">-</span>

          <button
            type="button"
            className={cn(
              'tabular-nums rounded px-0.5',
              activeSegment === 'year'
                ? 'bg-brand-700 text-surface font-semibold'
                : 'text-ink/50',
            )}
            onMouseDown={e => {
              e.preventDefault()
              setActiveSegment('year')
            }}
          >
            {yearDisplay}
          </button>
        </div>

        {/* Icon button – ONLY opens the calendar */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(o => !o)
            setView('days')
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/40 hover:bg-brand-300/15 hover:text-ink/80"
        >
          <CalendarDaysIcon className="h-4 w-4" />
        </button>

        {/* Calendar popover (your styles, unchanged) */}
        {isOpen && (
          <div
            className={cn(
              'absolute left-1/2 z-20 mt-2 -translate-x-1/2 rounded-xl border border-brand-300 bg-surface shadow-lg',
              'p-3 w-[90vw] max-w-[320px] sm:w-[360px] md:w-[400px]',
              'max-h-[430px] overflow-hidden',
            )}
          >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={goToPrevMonth}
                disabled={view === 'monthYear'}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25',
                  view === 'monthYear' && 'opacity-40 cursor-default',
                )}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>

              {/* Month/year label toggles the monthYear view */}
              <button
                type="button"
                onClick={() =>
                  setView(v => (v === 'days' ? 'monthYear' : 'days'))
                }
                className="rounded-full bg-brand-700 px-3 py-1 text-xs font-medium text-surface hover:bg-brand-600"
              >
                {monthLabel}
              </button>

              <button
                type="button"
                onClick={goToNextMonth}
                disabled={view === 'monthYear'}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25',
                  view === 'monthYear' && 'opacity-40 cursor-default',
                )}
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            {view === 'days' ? (
              <>
                {/* Weekday row */}
                <div className="mb-2 grid grid-cols-7 text-center text-[0.72rem] font-medium uppercase tracking-wide text-brand-700">
                  {weekdayLabels.map(day => (
                    <div key={day} className="py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 rounded-lg">
                  {days.map((day, idx) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="h-9 md:h-10"
                        />
                      )
                    }

                    const key = formatDate(day)
                    const isToday = key === todayKey
                    const isSelected = key === selectedKey

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectDay(day)}
                        className={cn(
                          'flex h-9 md:h-10 items-center justify-center rounded-md text-sm transition',
                          'text-ink/80 hover:bg-brand-300/15',
                          !isToday && !isSelected && 'bg-surface',
                          isToday && !isSelected && 'bg-brand-300/25 text-ink font-medium',
                          isSelected && 'bg-brand-700 text-surface font-semibold',
                        )}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex gap-3">
                  {/* Months (left) */}
                  <div className="flex-1 rounded-lg p-2">
                    <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink/65">
                      Month
                    </div>
                    <div className="max-h-40 overflow-y-auto pr-1 text-sm">
                      {monthNames.map((name, idx) => {
                        const isActive = idx === monthYear.monthIndex
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => handleSelectMonth(idx)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md px-2 py-1 text-left',
                              'text-ink/80 hover:bg-brand-300/20',
                              isActive &&
                                'bg-brand-700 text-surface font-semibold hover:bg-brand-700 hover:text-surface',
                            )}
                          >
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Years (right) */}
                  <div className="flex-1 rounded-lg bg-surface p-2">
                    <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink/60">
                      Year
                    </div>
                    <div className="max-h-40 overflow-y-auto pr-1 text-sm">
                      {years.map(y => {
                        const isActive = y === monthYear.year
                        return (
                          <button
                            key={y}
                            type="button"
                            onClick={() => handleSelectYear(y)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md px-2 py-1 text-left tabular-nums',
                              'text-ink/80 hover:bg-brand-300/20',
                              isActive &&
                                'bg-brand-700 text-surface font-semibold hover:bg-brand-700 hover:text-surface',
                            )}
                          >
                            {y}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setView('days')}
                    className="rounded-md px-2 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-brand-700 hover:bg-brand-300/15"
                  >
                    Back to days
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error ? (
  <p className="mt-1 text-xs text-rose-600">{error}</p>
) : helperText ? (
  <p className="mt-1 text-xs text-ink/60">{helperText}</p>
) : null}
    </div>
  )
}
