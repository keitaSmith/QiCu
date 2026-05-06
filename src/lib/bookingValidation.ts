import type { Booking } from '@/models/booking'
import { isTrashed } from '@/lib/lifecycleState'

const availabilityBlockingStatuses: ReadonlySet<Booking['status']> = new Set([
  'confirmed',
  'pending',
])

export function isBookingAvailabilityBlocking(booking: Booking, practitionerId?: string) {
  if (practitionerId && booking.practitionerId !== practitionerId) return false
  if (isTrashed(booking)) return false
  return availabilityBlockingStatuses.has(booking.status)
}

export function hasBookingOverlap(
  bookings: Booking[],
  startIso: string,
  endIso: string,
  excludeBookingId?: string,
) {
  const start = new Date(startIso)
  const end = new Date(endIso)

  return bookings.some(booking => {
    if (excludeBookingId && booking.id === excludeBookingId) return false
    if (!isBookingAvailabilityBlocking(booking)) return false

    const bookingStart = new Date(booking.start)
    const bookingEnd = new Date(booking.end)

    return start.getTime() < bookingEnd.getTime() && end.getTime() > bookingStart.getTime()
  })
}
