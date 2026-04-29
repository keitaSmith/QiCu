import { NextRequest, NextResponse } from 'next/server'

import { buildGoogleAuthUrl, hasGoogleCalendarEnv } from '@/lib/google/auth'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function GET(req: NextRequest) {
  if (!hasGoogleCalendarEnv()) {
    return NextResponse.json(
      {
        error:
          'Google Calendar env is not configured yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI first.',
      },
      { status: 400 },
    )
  }

  const practitionerId = getPractitionerIdFromRequest(req)
  const url = buildGoogleAuthUrl(practitionerId, req)
  return NextResponse.json({ url }, { status: 200 })
}
