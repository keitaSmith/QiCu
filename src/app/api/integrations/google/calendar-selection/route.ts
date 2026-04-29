import { NextRequest, NextResponse } from 'next/server'

import { getGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type Body = {
  calendarId?: string
  calendarName?: string
}

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const body = (await req.json()) as Body
  const calendarId = body.calendarId?.trim()

  if (!calendarId) {
    return NextResponse.json({ error: 'calendarId is required' }, { status: 400 })
  }

  const integration = getGoogleIntegration(practitionerId)
  if (!integration.connected) {
    return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 400 })
  }

  const updated = saveGoogleIntegration({
    ...integration,
    selectedCalendarId: calendarId,
    selectedCalendarName: body.calendarName?.trim() || calendarId,
  })

  return NextResponse.json(updated, { status: 200 })
}
