import { NextRequest, NextResponse } from 'next/server'

import { listGoogleCalendars } from '@/lib/google/calendarApi'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import { getErrorMessage } from '@/lib/errors'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function GET(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)

  try {
    const calendars = await listGoogleCalendars(practitionerId, req)
    const integration = googleIntegrationsRepository.getIntegration(practitionerId)

    if (!integration.selectedCalendarId && calendars[0]) {
      await googleIntegrationsRepository.saveIntegration(practitionerId, {
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
