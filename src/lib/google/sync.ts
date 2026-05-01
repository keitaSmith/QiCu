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

export function buildGoogleEventPayload(booking: Booking) {
  const patient = patientsStore.find(item => item.id === booking.patientId)
  const patientName = patient ? displayName(patient) : booking.patientId
  const syncedAt = new Date().toISOString()

  return {
    summary: `${patientName} - ${booking.serviceName}`,
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

    booking.externalSource = 'google'
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

  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected) return booking

  const calendarId = booking.externalCalendarId || integration.selectedCalendarId
  const eventId = booking.externalEventId

  if (!calendarId) return booking

  if (!eventId) {
    return syncGoogleOnBookingCreate(booking, req)
  }

  await updateGoogleCalendarEvent(
    booking.practitionerId,
    req,
    calendarId,
    eventId,
    buildGoogleEventPayload(booking),
  )

  booking.externalSource = 'google'
  booking.externalCalendarId = calendarId
  booking.externalSyncStatus = 'synced'
  booking.externalLastSyncedAt = new Date().toISOString()

  return booking
}

export async function syncGoogleOnBookingDelete(
  booking: Booking,
  req: NextRequest,
) {
  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected) return true

  const calendarId = booking.externalCalendarId || integration.selectedCalendarId
  const eventId = booking.externalEventId

  if (!calendarId || !eventId) return true

  await deleteGoogleCalendarEvent(booking.practitionerId, req, calendarId, eventId)
  return true
}
