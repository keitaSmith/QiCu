import { NextRequest, NextResponse } from 'next/server'

import { getGoogleCalendarEvent } from '@/lib/google/calendarApi'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function POST(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const integration = googleIntegrationsRepository.getIntegration(practitionerId)

  if (!integration.connected || !integration.selectedCalendarId) {
    return NextResponse.json({ error: 'Connect Google Calendar and choose a calendar first.' }, { status: 400 })
  }

  const linkedBookings = bookingsRepository.listGoogleLinkedBookingsForReconcile(practitionerId)

  let updated = 0
  let cancelled = 0
  let unchanged = 0

  for (const booking of linkedBookings) {
    const calendarId = booking.externalCalendarId || integration.selectedCalendarId
    const eventId = booking.externalEventId
    if (!calendarId || !eventId) continue

    const event = await getGoogleCalendarEvent(practitionerId, req, calendarId, eventId)

    const result = bookingsRepository.reconcileGoogleLinkedBooking(
      practitionerId,
      booking.id,
      event,
    )

    if (result === 'updated') {
      updated += 1
    } else if (result === 'cancelled') {
      cancelled += 1
    } else if (result === 'unchanged') {
      unchanged += 1
    }
  }

  return NextResponse.json({
    ok: true,
    linked: linkedBookings.length,
    updated,
    cancelled,
    unchanged,
  }, { status: 200 })
}
