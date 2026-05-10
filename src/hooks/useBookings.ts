import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Booking, BookingStatus } from '@/models/booking'
import { BOOKINGS_CHANGED_EVENT, emitBookingsChanged } from '@/lib/booking-events'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { buildPractitionerScopedFetchInit, type ClientPractitionerScope } from '@/lib/auth/clientFetch'
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

async function fetchBookings(scope: ClientPractitionerScope): Promise<Booking[]> {
  const res = await fetch('/api/bookings', buildPractitionerScopedFetchInit(scope, {
    cache: 'no-store',
  }))
  if (!res.ok) throw new Error('Failed to load bookings')
  return res.json()
}

async function createBooking(payload: CreateBookingInput, scope: ClientPractitionerScope): Promise<Booking> {
  const res = await fetch('/api/bookings', buildPractitionerScopedFetchInit(scope, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to create booking')
  }

  return res.json()
}

async function deleteBookingRequest(bookingId: string, scope: ClientPractitionerScope): Promise<void> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'DELETE',
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to delete booking')
  }
}

async function patchBooking(bookingId: string, payload: PatchBookingInput, scope: ClientPractitionerScope): Promise<Booking> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, buildPractitionerScopedFetchInit(scope, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw createRequestError(res.status, data?.error ?? 'Failed to update booking')
  }

  return res.json()
}

export function useBookings() {
  const practitioner = usePractitioner()
  const { practitionerId, source, authLoading } = practitioner
  const scope = useMemo(() => ({ practitionerId, source }), [practitionerId, source])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (authLoading) return []
      const items = await fetchBookings(scope)
      setBookings(items)
      return items
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load bookings'))
      return []
    } finally {
      setLoading(false)
    }
  }, [authLoading, scope])

  useEffect(() => {
    if (!authLoading) refresh().catch(() => null)
  }, [authLoading, refresh])

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
      const created = await createBooking(payload, scope)
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
  }, [prependBooking, scope])

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, { status }, scope)
      replaceBooking(updated)
      emitBookingsChanged()
      return updated
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update booking'))
      return null
    }
  }, [replaceBooking, scope])

  const patchBookingById = useCallback(async (bookingId: string, payload: PatchBookingInput, options?: MutationOptions) => {
    try {
      setError(null)
      const updated = await patchBooking(bookingId, payload, scope)
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
  }, [replaceBooking, scope])

  const deleteBookingById = useCallback(async (bookingId: string) => {
    try {
      setError(null)
      await deleteBookingRequest(bookingId, scope)
      removeBooking(bookingId)
      emitBookingsChanged()
      return true
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete booking'))
      return false
    }
  }, [removeBooking, scope])

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
