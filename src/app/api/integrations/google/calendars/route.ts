import { NextRequest, NextResponse } from 'next/server'

import { listGoogleCalendars } from '@/lib/google/calendarApi'
import { getGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import { getErrorMessage } from '@/lib/errors'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)

  try {
    const calendars = await listGoogleCalendars(practitionerId, req)
    const integration = getGoogleIntegration(practitionerId)

    if (!integration.selectedCalendarId && calendars[0]) {
      saveGoogleIntegration({
        ...integration,
        connected: true,
        selectedCalendarId: calendars[0].id,
        selectedCalendarName: calendars[0].summary,
      })
    }

    return NextResponse.json({ calendars }, { status: 200 })
  } catch (nextError: unknown) {
    return NextResponse.json({ error: getErrorMessage(nextError, 'Failed to load Google calendars') }, { status: 400 })
  }
}
