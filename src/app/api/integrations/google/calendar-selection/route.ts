import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

type Body = {
  calendarId?: string
  calendarName?: string
}

export async function POST(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const body = (await req.json()) as Body
  const calendarId = body.calendarId?.trim()

  if (!calendarId) {
    return NextResponse.json({ error: 'calendarId is required' }, { status: 400 })
  }

  let integration
  try {
    integration = await googleIntegrationsRepository.getUsableIntegration(practitionerId)
  } catch {
    return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 400 })
  }
  if (!integration.connected) {
    return NextResponse.json({ error: 'Google Calendar is not connected' }, { status: 400 })
  }

  const updated = await googleIntegrationsRepository.saveSelectedCalendar(practitionerId, {
    calendarId,
    calendarName: body.calendarName,
  })

  return NextResponse.json({
    practitionerId: updated.practitionerId,
    connected: updated.connected,
    googleUserEmail: updated.googleUserEmail,
    selectedCalendarId: updated.selectedCalendarId,
    selectedCalendarName: updated.selectedCalendarName,
    lastError: updated.lastError,
    connectedAt: updated.connectedAt,
  }, { status: 200 })
}
