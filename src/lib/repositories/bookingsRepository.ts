import { BOOKINGS } from '@/data/bookings'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { hasBookingOverlap, isBookingAvailabilityBlocking } from '@/lib/bookingValidation'
import { isTrashed, moveBookingToTrash } from '@/lib/dataLifecycle'
import type { GoogleCalendarEvent } from '@/lib/google/calendarApi'
import type { Booking, BookingStatus } from '@/models/booking'

export type CreateBookingInput = {
  patientId: string
  serviceId: string
  serviceName: string
  serviceDurationMinutes: number
  start: string
  end: string
  code: string
  id?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
  externalSource?: Booking['externalSource']
  externalCalendarId?: string | null
  externalEventId?: string | null
  externalSyncStatus?: Booking['externalSyncStatus']
}

export type UpdateBookingInput = {
  start?: string
  end?: string
  serviceId?: string
  serviceName?: string
  serviceDurationMinutes?: number
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
}

type CreateOptions = {
  insert?: 'start' | 'end'
}

export function listByPractitioner(practitionerId: string) {
  return BOOKINGS.filter(booking => booking.practitionerId === practitionerId && !isTrashed(booking))
}

export function listByPatient(practitionerId: string, patientId: string) {
  return listByPractitioner(practitionerId).filter(booking => booking.patientId === patientId)
}

export function listGoogleImportPreviewBookings(practitionerId: string) {
  return BOOKINGS.filter(booking => booking.practitionerId === practitionerId)
}

export function listGoogleLinkedBookingsForReconcile(practitionerId: string) {
  return BOOKINGS.filter(
    booking =>
      booking.practitionerId === practitionerId &&
      booking.externalSource === 'google' &&
      booking.externalCalendarId &&
      booking.externalEventId,
  )
}

export function getById(practitionerId: string, bookingId: string) {
  return (
    BOOKINGS.find(
      booking =>
        booking.id === bookingId &&
        booking.practitionerId === practitionerId &&
        !isTrashed(booking),
    ) ?? null
  )
}

export function findAvailabilityBlockingBookings(
  practitionerId: string,
  range?: { start?: string; end?: string },
) {
  return BOOKINGS.filter(booking => {
    if (!isBookingAvailabilityBlocking(booking, practitionerId)) return false
    if (!range?.start && !range?.end) return true

    const bookingStart = new Date(booking.start).getTime()
    const bookingEnd = new Date(booking.end).getTime()
    const rangeStart = range.start ? new Date(range.start).getTime() : Number.NEGATIVE_INFINITY
    const rangeEnd = range.end ? new Date(range.end).getTime() : Number.POSITIVE_INFINITY

    return bookingStart < rangeEnd && bookingEnd > rangeStart
  })
}

export function hasOverlapForPractitioner(
  practitionerId: string,
  start: string,
  end: string,
  excludeBookingId?: string,
) {
  return hasBookingOverlap(listByPractitioner(practitionerId), start, end, excludeBookingId)
}

export function createWithOverlapCheck(
  practitionerId: string,
  input: CreateBookingInput,
  options: CreateOptions = {},
) {
  if (hasOverlapForPractitioner(practitionerId, input.start, input.end)) {
    return { error: 'overlap' as const }
  }

  const created: Booking = {
    id: input.id ?? crypto.randomUUID(),
    practitionerId,
    code: input.code,
    patientId: input.patientId,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    serviceDurationMinutes: input.serviceDurationMinutes,
    start: input.start,
    end: input.end,
    resource: input.resource?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: input.status ?? 'confirmed',
    externalSource: input.externalSource ?? null,
    externalCalendarId: input.externalCalendarId?.trim() || null,
    externalEventId: input.externalEventId?.trim() || null,
    externalSyncStatus: input.externalSyncStatus ?? null,
  }

  if (options.insert === 'end') {
    BOOKINGS.push(created)
  } else {
    BOOKINGS.unshift(created)
  }

  return { booking: created }
}

export function updateWithOverlapCheck(
  practitionerId: string,
  bookingId: string,
  input: UpdateBookingInput,
) {
  const booking = getById(practitionerId, bookingId)
  if (!booking) return { error: 'not-found' as const }

  const nextStart = input.start ? new Date(input.start) : new Date(booking.start)
  const nextEnd = input.end ? new Date(input.end) : new Date(booking.end)
  const changesStart = input.start !== undefined && nextStart.toISOString() !== booking.start
  const changesEnd = input.end !== undefined && nextEnd.toISOString() !== booking.end
  const changesTime = changesStart || changesEnd
  const reactivatesCancelledBooking = input.status !== undefined && input.status !== 'cancelled'

  if (booking.status === 'cancelled' && changesTime && !reactivatesCancelledBooking) {
    return { error: 'cancelled-reschedule' as const }
  }

  if (hasOverlapForPractitioner(practitionerId, nextStart.toISOString(), nextEnd.toISOString(), booking.id)) {
    return { error: 'overlap' as const }
  }

  if (input.start) booking.start = nextStart.toISOString()
  if (input.end) booking.end = nextEnd.toISOString()

  if (input.serviceId !== undefined) {
    booking.serviceId = input.serviceId
  }
  if (input.serviceName !== undefined) {
    booking.serviceName = input.serviceName
  }
  if (input.serviceDurationMinutes !== undefined) {
    booking.serviceDurationMinutes = input.serviceDurationMinutes
  }
  if (input.resource !== undefined) {
    booking.resource = input.resource?.trim() || undefined
  }
  if (input.notes !== undefined) {
    booking.notes = input.notes?.trim() || undefined
  }
  if (input.status) {
    Object.assign(booking, applyBookingStatus(booking, input.status))
  }

  return { booking }
}

export function moveToTrash(practitionerId: string, bookingId: string) {
  if (!getById(practitionerId, bookingId)) return null
  return moveBookingToTrash(bookingId, practitionerId)
}

export function reconcileGoogleLinkedBooking(
  practitionerId: string,
  bookingId: string,
  event: GoogleCalendarEvent | null,
  options: { now?: Date } = {},
) {
  const booking = BOOKINGS.find(
    item =>
      item.id === bookingId &&
      item.practitionerId === practitionerId &&
      item.externalSource === 'google' &&
      item.externalCalendarId &&
      item.externalEventId,
  )
  if (!booking) return 'skipped' as const

  const now = (options.now ?? new Date()).toISOString()

  if (!event || event.status === 'cancelled') {
    if (booking.status !== 'cancelled') {
      booking.status = 'cancelled'
      booking.statusUpdatedAt = now
      booking.externalSyncStatus = 'synced'
      booking.externalLastSyncedAt = now
      return 'cancelled' as const
    }

    return 'unchanged' as const
  }

  let changed = false
  const start = event.start?.dateTime ? new Date(event.start.dateTime).toISOString() : booking.start
  const end = event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : booking.end
  const location = (event.location ?? '').trim() || undefined

  if (start && booking.start !== start) {
    booking.start = start
    changed = true
  }
  if (end && booking.end !== end) {
    booking.end = end
    changed = true
  }
  if ((booking.resource ?? '') !== (location ?? '')) {
    booking.resource = location
    changed = true
  }

  booking.externalSyncStatus = 'synced'
  booking.externalLastSyncedAt = now

  return changed ? ('updated' as const) : ('unchanged' as const)
}
