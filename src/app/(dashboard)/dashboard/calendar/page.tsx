
'use client'

import { useEffect, useMemo, useState } from 'react'

import { BookingDialog } from '@/components/bookings/BookingDialog'
import { BookingDetailPanel } from '@/components/bookings/BookingDetailPanel'
import { CalendarDayView } from '@/components/calendar/CalendarDayView'
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView'
import { CalendarToolbar } from '@/components/calendar/CalendarToolbar'
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView'
import { CalendarYearView } from '@/components/calendar/CalendarYearView'
import { useRightPanel } from '@/components/layout/RightPanelContext'
import { CardListSkeleton } from '@/components/ui/CardListSkeleton'
import { dateFmt } from '@/lib/dates'
import { addDays, addMonths, addYears, formatHeaderLabel, groupEventsByDate, startOfWeek, toCalendarEvents, type CalendarBookingEvent, type CalendarView } from '@/lib/calendar'
import { displayName, nameMap } from '@/lib/patients/selectors'
import { useBookings } from '@/hooks/useBookings'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { usePatients } from '@/hooks/usePatients'
import type { Booking } from '@/models/booking'

const EMPTY_BOOKING_LIST: Booking[] = []

export default function CalendarPage() {
  const isDesktop = useIsDesktop()
  const { setRightPanelContent } = useRightPanel()
  const { bookings, loading, error, createBookingRecord } = useBookings()
  const { patients, loading: patientsLoading } = usePatients()

  const [view, setView] = useState<CalendarView>('month')
  const [cursorDate, setCursorDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mobileSelected, setMobileSelected] = useState<CalendarBookingEvent | null>(null)

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  const patientNames = useMemo(() => nameMap(patients), [patients])
  const patientOptions = useMemo(() => patients.map(patient => ({ id: patient.id ?? '', name: displayName(patient) })), [patients])
  const calendarEvents = useMemo(() => toCalendarEvents(bookings, patientNames), [bookings, patientNames])
  const eventsByDate = useMemo(() => groupEventsByDate(calendarEvents), [calendarEvents])


  const title = useMemo(() => formatHeaderLabel(view, cursorDate), [view, cursorDate])

  function openBooking(event: CalendarBookingEvent) {
    if (isDesktop) {
      setRightPanelContent(<BookingDetailPanel booking={event.booking} patientName={event.patientName} />)
    } else {
      setMobileSelected(event)
    }
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    if (view === 'year') {
      setCursorDate(date)
    }
    if (!isDesktop) {
      const hit = (eventsByDate[`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`] ?? [])[0] ?? null
      setMobileSelected(hit)
    }
  }

  function shiftCursor(direction: -1 | 1) {
    const next = (() => {
      if (view === 'day') return addDays(selectedDate, direction)
      if (view === 'week') return addDays(cursorDate, direction * 7)
      if (view === 'year') return addYears(cursorDate, direction)
      return addMonths(cursorDate, direction)
    })()

    setCursorDate(next)

    if (view === 'day') {
      setSelectedDate(next)
    } else if (view === 'week') {
      setSelectedDate(addDays(selectedDate, direction * 7))
    } else if (view === 'month') {
      setSelectedDate(addMonths(selectedDate, direction))
    } else {
      setSelectedDate(addYears(selectedDate, direction))
    }
  }

  function goToToday() {
    const now = new Date()
    setCursorDate(now)
    setSelectedDate(now)
  }

  function renderView() {
    if (view === 'day') {
      return <CalendarDayView date={selectedDate} eventsByDate={eventsByDate} onOpenBooking={openBooking} />
    }
    if (view === 'week') {
      return <CalendarWeekView cursorDate={cursorDate} selectedDate={selectedDate} eventsByDate={eventsByDate} onSelectDate={handleSelectDate} onOpenBooking={openBooking} />
    }
    if (view === 'year') {
      return <CalendarYearView cursorDate={cursorDate} selectedDate={selectedDate} eventsByDate={eventsByDate} onSelectDate={handleSelectDate} />
    }
    return <CalendarMonthView cursorDate={cursorDate} selectedDate={selectedDate} eventsByDate={eventsByDate} onSelectDate={handleSelectDate} onOpenBooking={openBooking} />
  }

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        title={title}
        onPrev={() => shiftCursor(-1)}
        onNext={() => shiftCursor(1)}
        onToday={goToToday}
        onViewChange={next => {
          setView(next)
          if (next === 'day') {
            setCursorDate(selectedDate)
            return
          }
          if (next === 'week') {
            setCursorDate(startOfWeek(selectedDate))
            return
          }
          setCursorDate(selectedDate)
        }}
        onNewBooking={() => setDialogOpen(true)}
      />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {loading || patientsLoading ? (
        <CardListSkeleton items={4} lines={3} />
      ) : (
        renderView()
      )}

      {!isDesktop ? (
        <div className="space-y-3 rounded-2xl border border-brand-300/30 bg-surface p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-ink">Selected day</p>
            <p className="mt-1 text-sm text-ink/60">{dateFmt.format(selectedDate)}</p>
          </div>
          {mobileSelected ? <BookingDetailPanel booking={mobileSelected.booking} patientName={mobileSelected.patientName} /> : <div className="rounded-xl border border-dashed border-brand-300/40 bg-canvas/30 px-4 py-6 text-sm text-ink/60">Tap a booking to see the details here.</div>}
        </div>
      ) : null}

      <BookingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode="create"
        patients={patientOptions}
        existingBookings={EMPTY_BOOKING_LIST}
        onCreated={async booking => {
          await createBookingRecord({
            patientId: booking.patientId,
            serviceId: booking.serviceId,
            start: booking.start,
            end: booking.end,
            resource: booking.resource ?? '',
            notes: booking.notes ?? '',
            status: booking.status,
          })
        }}
      />
    </div>
  )
}
