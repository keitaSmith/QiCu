import type { Booking } from '@/models/booking'

export function hasBookingOverlap(
  bookings: Booking[],
  practitionerId: string,
  startIso: string,
  endIso: string,
  excludeBookingId?: string,
) {
  const start = new Date(startIso)
  const end = new Date(endIso)

  return bookings.some(booking => {
    if (booking.practitionerId !== practitionerId) return false
    if (excludeBookingId && booking.id === excludeBookingId) return false

    const bookingStart = new Date(booking.start)
    const bookingEnd = new Date(booking.end)

    return start.getTime() < bookingEnd.getTime() && end.getTime() > bookingStart.getTime()
  })
}
