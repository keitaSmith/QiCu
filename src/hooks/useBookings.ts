import { useCallback, useEffect, useState } from 'react'

import type { Booking, BookingStatus } from '@/models/booking'
import { BOOKINGS_CHANGED_EVENT, emitBookingsChanged } from '@/lib/booking-events'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { withPractitionerHeaders } from '@/lib/practitioners'
import { getErrorMessage } from '@/lib/errors'

type CreateBookingInput = {
  patientId: string
  serviceId: string
  start: string
  end: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
  externalSource?: Booking['externalSource']
  externalCalendarId?: string | null
  externalEventId?: string | null
  externalSyncStatus?: Booking['externalSyncStatus']
  skipGoogleWriteback?: boolean
}

type PatchBookingInput = {
  start?: string
  end?: string
  serviceId?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
  skipGoogleWriteback?: boolean
}

type MutationOptions = {
  throwOnError?: boolean
}

type RequestError = Error & {
  status?: number
}

function createRequestError(status: number, message: string): RequestError {
  return Object.assign(new Error(message), { status })
}

async function fetchBookings(practitionerId: string): Promise<Booking[]> {
  const res = await fetch('/api/bookings', {
    cache: 'no-store',
    headers: withPractitionerHeaders(practitionerId),
  })
  if (!res.ok) throw new Error('Failed to load bookings')
  return res.json()
}

async function createBooking(payload: CreateBookingInput, practitionerId: string): Promise<Booking> {
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to create booking')
  }

  return res.json()
}

async function deleteBookingRequest(bookingId: string, practitionerId: string): Promise<void> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'DELETE',
    headers: withPractitionerHeaders(practitionerId),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to delete booking')
  }
}

async function patchBooking(bookingId: string, payload: PatchBookingInput, practitionerId: string): Promise<Booking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to update booking')
  }

  return res.json()
}

export function useBookings() {
  const { practitionerId } = usePractitioner()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const items = await fetchBookings(practitionerId)
      setBookings(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load bookings'))
      return []
    } finally {
      setLoading(false)
    }
  }, [practitionerId])

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

  const removeBooking = useCallback((bookingId: string) => {
    setBookings(prev => prev.filter(b => b.id !== bookingId))
  }, [])

  const createBookingRecord = useCallback(async (payload: CreateBookingInput, options?: MutationOptions) => {
    try {
      setError(null)
      const created = await createBooking(payload, practitionerId)
      prependBooking(created)
      emitBookingsChanged()
      return created
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create booking'))
      if (options?.throwOnError) {
        throw e
      }
      return null
    }
  }, [prependBooking, practitionerId])

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, { status }, practitionerId)
      replaceBooking(updated)
      emitBookingsChanged()
      return updated
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update booking'))
      return null
    }
  }, [replaceBooking, practitionerId])

  const patchBookingById = useCallback(async (bookingId: string, payload: PatchBookingInput, options?: MutationOptions) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, payload, practitionerId)
      replaceBooking(updated)
      emitBookingsChanged()
      return updated
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update booking'))
      if (options?.throwOnError) {
        throw e
      }
      return null
    }
  }, [replaceBooking, practitionerId])

  const deleteBookingById = useCallback(async (bookingId: string) => {
    try {
      setError(null)
      await deleteBookingRequest(bookingId, practitionerId)
      removeBooking(bookingId)
      emitBookingsChanged()
      return true
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete booking'))
      return false
    }
  }, [removeBooking, practitionerId])

  return {
    practitionerId,
    bookings,
    loading,
    error,
    refresh,
    setBookings,
    replaceBooking,
    prependBooking,
    createBookingRecord,
    removeBooking,
    updateBookingStatus,
    patchBookingById,
    deleteBookingById,
  }
}
