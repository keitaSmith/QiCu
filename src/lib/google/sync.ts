import type { NextRequest } from 'next/server'

import { patientsStore } from '@/data/patientsStore'
import { getGoogleIntegration } from '@/lib/google/store'
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from '@/lib/google/calendarApi'
import { displayName } from '@/models/patient'
import type { Booking } from '@/models/booking'

function buildGoogleEventDescription(booking: Booking, patientName: string, syncedAt: string) {
  return [
    `Patient: ${patientName}`,
    `Service: ${booking.serviceName}`,
    `Status: ${booking.status}`,
    `QiCu Last synced at: ${syncedAt}`,
  ].join('\n')
}

function buildGoogleEventPayload(booking: Booking) {
  const patient = patientsStore.find(item => item.id === booking.patientId)
  const patientName = patient ? displayName(patient) : booking.patientId
  const summaryBase = `${patientName} — ${booking.serviceName}`
  const summary =
    booking.status === 'cancelled'
      ? `CANCELLED: ${summaryBase}`
      : booking.status === 'no-show'
        ? `NO-SHOW: ${summaryBase}`
        : summaryBase
  const syncedAt = new Date().toISOString()

  return {
    summary,
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

  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected || !integration.selectedCalendarId) {
    return booking
  }

  const createdEvent = await createGoogleCalendarEvent(
    booking.practitionerId,
    req,
    integration.selectedCalendarId,
    buildGoogleEventPayload(booking),
  )

  booking.externalSource = 'google'
  booking.externalCalendarId = integration.selectedCalendarId
  booking.externalEventId = createdEvent.id
  booking.externalSyncStatus = 'synced'
  booking.externalLastSyncedAt = new Date().toISOString()

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

export async function syncGoogleOnBookingDelete(booking: Booking, req: NextRequest) {
  const integration = getGoogleIntegration(booking.practitionerId)
  if (!integration.connected) return true

  const calendarId = booking.externalCalendarId || integration.selectedCalendarId
  const eventId = booking.externalEventId

  if (!calendarId || !eventId) return true

  await deleteGoogleCalendarEvent(booking.practitionerId, req, calendarId, eventId)
  return true
}
