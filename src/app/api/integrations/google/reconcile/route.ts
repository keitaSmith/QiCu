import { NextRequest, NextResponse } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { getGoogleCalendarEvent } from '@/lib/google/calendarApi'
import { getGoogleIntegration } from '@/lib/google/store'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const integration = getGoogleIntegration(practitionerId)

  if (!integration.connected || !integration.selectedCalendarId) {
    return NextResponse.json({ error: 'Connect Google Calendar and choose a calendar first.' }, { status: 400 })
  }

  const linkedBookings = BOOKINGS.filter(
    booking =>
      booking.practitionerId === practitionerId &&
      booking.externalSource === 'google' &&
      booking.externalCalendarId &&
      booking.externalEventId,
  )

  let updated = 0
  let cancelled = 0
  let unchanged = 0

  for (const booking of linkedBookings) {
    const calendarId = booking.externalCalendarId || integration.selectedCalendarId
    const eventId = booking.externalEventId
    if (!calendarId || !eventId) continue

    const event = await getGoogleCalendarEvent(practitionerId, req, calendarId, eventId)

    if (!event || event.status === 'cancelled') {
      if (booking.status !== 'cancelled') {
        booking.status = 'cancelled'
        booking.statusUpdatedAt = new Date().toISOString()
        booking.externalSyncStatus = 'synced'
        booking.externalLastSyncedAt = new Date().toISOString()
        cancelled += 1
      } else {
        unchanged += 1
      }
      continue
    }

    let changed = false
    const start = event.start?.dateTime ? new Date(event.start.dateTime).toISOString() : booking.start
    const end = event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : booking.end
    const location = (event.location ?? '').trim() || undefined

    if (start && booking.start !== start) {
      booking.start = start
      changed = true
    }
    if (end && booking.end !== end) {
      booking.end = end
      changed = true
    }
    if ((booking.resource ?? '') !== (location ?? '')) {
      booking.resource = location
      changed = true
    }

    booking.externalSyncStatus = 'synced'
    booking.externalLastSyncedAt = new Date().toISOString()

    if (changed) {
      updated += 1
    } else {
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
