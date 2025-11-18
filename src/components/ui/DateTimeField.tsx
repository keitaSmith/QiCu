'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDaysIcon,
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/cn'

type DateTimeFieldProps = {
  label?: string
  value: string                // e.g. "2025-10-02T14:30"
  onChange: (value: string) => void
  required?: boolean
  name?: string                // optional, for form validation
  helperText?: string
}

/* ---------- utils ---------- */

function parseDate(value: string | null) {
  if (!value) return null
  const [datePart] = value.split('T')
  if (!datePart) return null
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatDate(date: Date | null) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDaysMatrix(year: number, monthIndex: number) {
  // monthIndex: 0-11
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

/* ---------- component ---------- */

export function DateTimeField({
  label,
  value,
  onChange,
  required,
  name,
  helperText,
}: DateTimeFieldProps) {
  const [isDateOpen, setIsDateOpen] = useState(false)
  const [isTimeOpen, setIsTimeOpen] = useState(false)

  const [datePart, rawTimePart] = value ? value.split('T') : ['', '']
  const selectedDate = useMemo(() => parseDate(value || ''), [value])
  const timePart = (rawTimePart || '').slice(0, 5) // HH:MM

  const [now, setNowState] = useState(() => new Date())
  const today = useMemo(() => new Date(), [])

  // Update "now" while time picker is open so the Now button is current
  useEffect(() => {
    if (!isTimeOpen) return
    const id = setInterval(() => setNowState(new Date()), 15_000)
    return () => clearInterval(id)
  }, [isTimeOpen])

  const initialMonthDate = selectedDate ?? today

  const [monthYear, setMonthYear] = useState({
    year: initialMonthDate.getFullYear(),
    monthIndex: initialMonthDate.getMonth(), // 0–11
  })

  // When external value changes (editing existing session), sync calendar month
  useEffect(() => {
    if (!selectedDate) return
    setMonthYear({
      year: selectedDate.getFullYear(),
      monthIndex: selectedDate.getMonth(),
    })
  }, [selectedDate])

  const days = useMemo(
    () => getDaysMatrix(monthYear.year, monthYear.monthIndex),
    [monthYear.year, monthYear.monthIndex],
  )

  function handleDateChange(dateString: string) {
    if (!dateString) {
      onChange('')
      return
    }
    const time = timePart || '00:00'
    onChange(`${dateString}T${time}`)
  }

  function handleTimeChange(nextTime: string) {
    if (!nextTime) {
      onChange('')
      return
    }
    const dateString =
      datePart && datePart.length === 10
        ? datePart
        : formatDate(today)

    onChange(`${dateString}T${nextTime}`)
  }

  function handleSelectDay(day: Date) {
    handleDateChange(formatDate(day))
    setIsDateOpen(false)
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

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }),
    [],
  )

  const monthLabel = monthFormatter.format(
    new Date(monthYear.year, monthYear.monthIndex, 1),
  )

  const weekdayLabels = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

  const todayKey = formatDate(today)
  const selectedKey = selectedDate ? formatDate(selectedDate) : null

  const displayDate = selectedDate ? formatDate(selectedDate) : 'Select date'
  const displayTime = timePart || '--:--'

  /* ----- time helpers (full 00–59 minutes) ----- */

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])
  const minutes = useMemo(
    () => Array.from({ length: 60 }, (_, i) => i),
    [],
  )

  function getCurrentHM(): { hour: number; minute: number } {
    if (timePart && timePart.includes(':')) {
      const [h, m] = timePart.split(':').map(Number)
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        return { hour: h, minute: m }
      }
    }
    return { hour: now.getHours(), minute: now.getMinutes() }
  }

  function setHourDirect(h: number) {
    const { minute } = getCurrentHM()
    handleTimeChange(
      `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    )
  }

  function setMinuteDirect(m: number) {
    const { hour } = getCurrentHM()
    handleTimeChange(
      `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    )
  }

  function applyNow() {
    const current = new Date()
    const hh = String(current.getHours()).padStart(2, '0')
    const mm = String(current.getMinutes()).padStart(2, '0')
    handleTimeChange(`${hh}:${mm}`)
  }

  function clearTime() {
    if (!datePart) {
      onChange('')
      return
    }
    onChange(`${datePart}T00:00`)
  }

  const { hour: currentHour, minute: currentMinute } = getCurrentHM()

  /* ---------- render ---------- */

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}

      {name && (
        <input type="hidden" name={name} value={value} required={required} />
      )}

      <div className="flex gap-2">
        {/* DATE FIELD */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => {
              setIsDateOpen(o => !o)
              setIsTimeOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border border-slate-300 bg-surface px-3 py-2 text-left text-sm text-ink',
              'outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600',
            )}
          >
            <span
              className={cn(
                'flex items-center gap-2 truncate',
                !selectedDate && 'text-ink/50',
              )}
            >
              <span className="truncate">{displayDate}</span>
            </span>
            <CalendarDaysIcon className="h-4 w-4 text-ink/50" />
          </button>

          {isDateOpen && (
            <div
              className={cn(
                'absolute z-20 mt-1 rounded-xl border border-brand-300 bg-surface shadow-lg',
                'p-3 w-[80vw] max-w-[320px] sm:w-[360px] md:w-[400px]',
                'max-h-[430px] overflow-hidden',
              )}
            >
              {/* Header with month nav */}
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goToPrevMonth}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <div className="text-sm font-semibold text-ink">
                  {monthLabel}
                </div>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-300/15 text-brand-700 hover:bg-brand-300/25"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Weekday row */}
              <div className="mb-2 grid grid-cols-7 text-center text-[0.72rem] font-medium uppercase tracking-wide text-brand-700">
                {weekdayLabels.map(day => (
                  <div key={day} className="py-1">
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid – no lines, clean brand highlights */}
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
          'text-ink/80 hover:bg-brand-300/20',
          // base background
          !isToday && !isSelected && 'bg-surface',
          // today (only if not selected)
          isToday && !isSelected && 'bg-brand-300/25 text-ink font-medium',
          // selected date
          isSelected && 'bg-brand-700 text-surface font-semibold hover:text-ink',
        )}
      >
        {day.getDate()}
      </button>
    )
  })}
</div>
            </div>
          )}
        </div>

        {/* TIME FIELD */}
        <div className="relative w-36 sm:w-40">
          <button
            type="button"
            onClick={() => {
              setIsTimeOpen(o => !o)
              setIsDateOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border border-slate-300 bg-surface px-3 py-2 text-left text-sm text-ink',
              'outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600',
            )}
          >
            <span
              className={cn(
                'tabular-nums',
                !timePart && 'text-ink/50',
              )}
            >
              {displayTime}
            </span>
            <ClockIcon className="h-4 w-4 text-ink/50" />
          </button>

          {isTimeOpen && (
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-xl border border-brand-300 bg-surface p-3 shadow-lg">
              

              {/* Hour / minute lists */}
              <div className="mb-3 flex gap-3">
                {/* Hour list */}
                <div className="flex-1 rounded-lg p-2">
                  <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink/60">
                    Hour
                  </div>
                  <div className="max-h-40 overflow-y-auto pr-1 text-sm">
                    {hours.map(h => {
                      const isActive = h === currentHour
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setHourDirect(h)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2 py-1 tabular-nums',
                            'text-ink/80 hover:bg-brand-300/25',
                            isActive &&
                              'bg-brand-700 text-surface font-semibold',
                          )}
                        >
                          <span>{String(h).padStart(2, '0')}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Minute list */}
                <div className="flex-1 rounded-lg p-2">
                  <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink/60">
                    Minute
                  </div>
                  <div className="max-h-40 overflow-y-auto pr-1 text-sm">
                    {minutes.map(m => {
                      const isActive = m === currentMinute
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMinuteDirect(m)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md px-2 py-1 tabular-nums',
                            'text-ink/80 hover:bg-brand-300/15',
                            isActive &&
                              'bg-brand-700 text-surface font-semibold',
                          )}
                        >
                          <span>{String(m).padStart(2, '0')}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={applyNow}
                  className="rounded-md px-2 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-brand-700 hover:bg-brand-300/15"
                >
                  Now
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearTime}
                    className="rounded-md px-2 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-ink/60 hover:bg-canvas"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTimeOpen(false)}
                    className="rounded-md bg-brand-700 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-surface hover:bg-brand-600"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {helperText && (
        <p className="text-xs text-ink/60">{helperText}</p>
      )}
    </div>
  )
}
