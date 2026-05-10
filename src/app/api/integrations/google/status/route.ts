import { NextRequest, NextResponse } from 'next/server'

import { hasGoogleCalendarEnv } from '@/lib/google/auth'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function GET(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const status = await googleIntegrationsRepository.getStatus(practitionerId)

  return NextResponse.json(
    {
      connected: status.connected,
      googleUserEmail: status.googleUserEmail,
      selectedCalendarId: status.selectedCalendarId,
      selectedCalendarName: status.selectedCalendarName,
      canConnect: hasGoogleCalendarEnv(),
      lastError: status.lastError,
    },
    { status: 200 },
  )
}
