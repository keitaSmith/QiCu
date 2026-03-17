import { useMemo } from 'react'

import type { Booking } from '@/models/booking'

export type TaskKind =
  | 'ready-to-start'
  | 'needs-status'
  | 'begin-note'
  | 'finish-visit'
  | 'write-note'

export type TaskBooking = {
  booking: Booking
  kind: TaskKind
}

export function useTasks(bookings: Booking[]) {
  return useMemo(() => {
    const now = new Date()
    const items: TaskBooking[] = []

    for (const booking of bookings) {
      const start = new Date(booking.start)
      const end = new Date(booking.end)
      const hasStarted =
        !Number.isNaN(start.getTime()) && start.getTime() <= now.getTime()
      const isPast =
        !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()
      const isCurrent = hasStarted && !isPast

      if (booking.status === 'confirmed' && isCurrent) {
        items.push({ booking, kind: 'ready-to-start' })
        continue
      }

      if (booking.status === 'confirmed' && isPast) {
        items.push({ booking, kind: 'needs-status' })
        continue
      }

      if (booking.status === 'in-progress' && !booking.sessionId) {
        items.push({ booking, kind: 'begin-note' })
        continue
      }

      if (booking.status === 'in-progress' && booking.sessionId && isPast) {
        items.push({ booking, kind: 'finish-visit' })
        continue
      }

      if (booking.status === 'completed' && !booking.sessionId) {
        items.push({ booking, kind: 'write-note' })
      }
    }

    items.sort(
      (a, b) =>
        new Date(a.booking.start).getTime() -
        new Date(b.booking.start).getTime(),
    )

    return items
  }, [bookings])
}
