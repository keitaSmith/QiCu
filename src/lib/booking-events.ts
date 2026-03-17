export const BOOKINGS_CHANGED_EVENT = 'qicu:bookings-changed'

export function emitBookingsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT))
}
