import type { Booking, BookingStatus } from '@/models/booking'

export function applyBookingStatus(
  booking: Booking,
  status: BookingStatus,
): Booking {
  return {
    ...booking,
    status,
    statusUpdatedAt: new Date().toISOString(),
  }
}
