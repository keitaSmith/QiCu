import type { NextRequest } from 'next/server'

import { patientsStore } from '@/data/patientsStore'
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from '@/lib/google/calendarApi'
import { getGoogleIntegration } from '@/lib/google/store'
import type { Booking } from '@/models/booking'
import { displayName } from '@/models/patient'

export function buildGoogleEventDescription(
  booking: Booking,
  patientName: string,
  syncedAt: string,
) {
  return [
    `QiCu Booking ID: ${booking.id}`,
    `QiCu Booking Code: ${booking.code}`,
    `Patient: ${patientName}`,
    `Service: ${booking.serviceName}`,
    `Status: ${booking.status}`,
    `Practitioner ID: ${booking.practitionerId}`,
    `Patient ID: ${booking.patientId}`,
    `Service ID: ${booking.serviceId}`,
    `QiCu Last synced at: ${syncedAt}`,
  ].join('\n')
}

function buildGoogleEventSummary(booking: Booking, patientName: string) {
  const baseSummary = `${patientName} - ${booking.serviceName}`
  if (booking.status === 'no-show') {
    return `${baseSummary} (No-show)`
  }
  return baseSummary
}

export function buildGoogleEventPayload(booking: Booking) {
  const patient = patientsStore.find(item => item.id === booking.patientId)
  const patientName = patient ? displayName(patient) : booking.patientId
  const syncedAt = new Date().toISOString()

  return {
    summary: buildGoogleEventSummary(booking, patientName),
    description: buildGoogleEventDescription(booking, patientName, syncedAt),
    location: booking.resource ?? undefined,
    start: {
      dateTime: booking.start,
    },
    end: {
      dateTime: booking.end,
    },
    extendedProperties: {
      private: {
        qicuBookingId: booking.id,
        qicuBookingCode: booking.code,
        qicuPatientId: booking.patientId,
        qicuServiceId: booking.serviceId,
        qicuPractitionerId: booking.practitionerId,
        qicuStatus: booking.status,
        qicuLastSyncedAt: syncedAt,
        source: 'qicu',
      },
    },
  }
}

export async function syncGoogleOnBookingCreate(
  booking: Booking,
  req: NextRequest,
  options?: { skip?: boolean },
) {
  if (options?.skip) return booking
  if (booking.externalEventId) return booking
  if (booking.externalSource !== null && booking.externalSource !== undefined) {
    return booking
  }

  const integration = getGoogleIntegration(booking.practitionerId)
  const calendarId = booking.externalCalendarId || integration.selectedCalendarId

  if (!integration.connected || !calendarId) {
    return booking
  }

  try {
    const createdEvent = await createGoogleCalendarEvent(
      booking.practitionerId,
      req,
      calendarId,
      buildGoogleEventPayload(booking),
    )

    booking.externalCalendarId = calendarId
    booking.externalEventId = createdEvent.id
    booking.externalSyncStatus = 'synced'
    booking.externalLastSyncedAt = new Date().toISOString()
  } catch (error) {
    console.error('Google Calendar booking create sync failed', {
      bookingId: booking.id,
      practitionerId: booking.practitionerId,
      calendarId,
      error,
    })
    booking.externalSyncStatus = 'error'
  }

  return booking
}

export async function syncGoogleOnBookingUpdate(
  booking: Booking,
  req: NextRequest,
  options?: { skip?: boolean },
) {
  if (options?.skip) return booking
  if (!booking.externalEventId) return booking
  if (booking.externalSource === 'google') return booking

  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected) return booking

  const calendarId = booking.externalCalendarId || integration.selectedCalendarId
  const eventId = booking.externalEventId

  if (!calendarId) return booking

  try {
    if (booking.status === 'cancelled') {
      await deleteGoogleCalendarEvent(booking.practitionerId, req, calendarId, eventId)
      booking.externalSyncStatus = 'synced'
      booking.externalLastSyncedAt = new Date().toISOString()
      return booking
    }

    await updateGoogleCalendarEvent(
      booking.practitionerId,
      req,
      calendarId,
      eventId,
      buildGoogleEventPayload(booking),
    )

    booking.externalCalendarId = calendarId
    booking.externalSyncStatus = 'synced'
    booking.externalLastSyncedAt = new Date().toISOString()
  } catch (error) {
    console.error('Google Calendar booking update sync failed', {
      bookingId: booking.id,
      practitionerId: booking.practitionerId,
      calendarId,
      eventId,
      error,
    })
    booking.externalSyncStatus = 'error'
  }

  return booking
}

export async function syncGoogleOnBookingDelete(
  booking: Booking,
  req: NextRequest,
  options?: { skip?: boolean },
) {
  if (options?.skip) return true
  if (!booking.externalEventId) return true
  if (booking.externalSource === 'google') return true

  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected) return true

  const calendarId = booking.externalCalendarId || integration.selectedCalendarId
  const eventId = booking.externalEventId

  if (!calendarId || !eventId) return true

  try {
    await deleteGoogleCalendarEvent(booking.practitionerId, req, calendarId, eventId)
    booking.externalSyncStatus = 'synced'
    booking.externalLastSyncedAt = new Date().toISOString()
  } catch (error) {
    console.error('Google Calendar booking delete sync failed', {
      bookingId: booking.id,
      practitionerId: booking.practitionerId,
      calendarId,
      eventId,
      error,
    })
    booking.externalSyncStatus = 'error'
  }

  return true
}
