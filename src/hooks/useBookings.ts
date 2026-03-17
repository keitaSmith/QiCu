import { useCallback, useEffect, useState } from 'react'

import type { Booking, BookingStatus } from '@/models/booking'
import { BOOKINGS_CHANGED_EVENT, emitBookingsChanged } from '@/lib/booking-events'

type PatchBookingInput = {
  start?: string
  end?: string
  serviceId?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
}

async function fetchBookings(): Promise<Booking[]> {
  const res = await fetch('/api/bookings', { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load bookings')
  return res.json()
}

async function patchBooking(bookingId: string, payload: PatchBookingInput): Promise<Booking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? 'Failed to update booking')
  }

  return res.json()
}

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchBookings()
      setBookings(items)
      return items
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load bookings')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => null)
  }, [refresh])

  useEffect(() => {
    const onChanged = () => {
      refresh().catch(() => null)
    }

    window.addEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BOOKINGS_CHANGED_EVENT, onChanged)
  }, [refresh])

  const replaceBooking = useCallback((updated: Booking) => {
    setBookings(prev => prev.map(b => (b.id === updated.id ? updated : b)))
  }, [])

  const prependBooking = useCallback((created: Booking) => {
    setBookings(prev => [created, ...prev])
  }, [])

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, { status })
      replaceBooking(updated)
      emitBookingsChanged()
      return updated
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update booking')
      return null
    }
  }, [replaceBooking])

  const patchBookingById = useCallback(async (bookingId: string, payload: PatchBookingInput) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, payload)
      replaceBooking(updated)
      emitBookingsChanged()
      return updated
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update booking')
      return null
    }
  }, [replaceBooking])

  return {
    bookings,
    loading,
    error,
    refresh,
    setBookings,
    replaceBooking,
    prependBooking,
    updateBookingStatus,
    patchBookingById,
  }
}
