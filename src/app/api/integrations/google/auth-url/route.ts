import { NextRequest, NextResponse } from 'next/server'

import { buildGoogleAuthUrl, hasGoogleCalendarEnv } from '@/lib/google/auth'
import { authScopeErrorResponse, getPractitionerIdFromRequest } from '@/lib/practitionerRequest'

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

  let practitionerId: string
  try {
    practitionerId = await getPractitionerIdFromRequest(req)
  } catch (error) {
    const response = authScopeErrorResponse(error)
    if (response) return response
    throw error
  }

  const url = await buildGoogleAuthUrl(practitionerId, req)
  return NextResponse.json({ url }, { status: 200 })
}
