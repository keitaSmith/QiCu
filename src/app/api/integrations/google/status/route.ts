import { NextRequest, NextResponse } from 'next/server'

import { hasGoogleCalendarEnv } from '@/lib/google/auth'
import { getGoogleIntegration } from '@/lib/google/store'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const integration = getGoogleIntegration(practitionerId)

  return NextResponse.json(
    {
      connected: integration.connected,
      googleUserEmail: integration.googleUserEmail,
      selectedCalendarId: integration.selectedCalendarId,
      selectedCalendarName: integration.selectedCalendarName,
      canConnect: hasGoogleCalendarEnv(),
      lastError: integration.lastError ?? null,
    },
    { status: 200 },
  )
}
