import { NextRequest, NextResponse } from 'next/server'

import { listGoogleCalendarEvents } from '@/lib/google/calendarApi'
import { buildGoogleBookingImportPreview } from '@/lib/google/eventMapping'
import type { GoogleImportMode } from '@/lib/google/types'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import { getErrorMessage } from '@/lib/errors'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'

function startOfTodayIso() {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return now.toISOString()
}

function ninetyDaysFromTodayIso() {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  now.setDate(now.getDate() + 90)
  return now.toISOString()
}

export async function GET(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const integration = googleIntegrationsRepository.getIntegration(practitionerId)

  if (!integration.connected || !integration.selectedCalendarId) {
    return NextResponse.json({ error: 'Connect Google Calendar and choose a calendar first.' }, { status: 400 })
  }

  const from = req.nextUrl.searchParams.get('from')?.trim() || startOfTodayIso()
  const to = req.nextUrl.searchParams.get('to')?.trim() || ninetyDaysFromTodayIso()
  const importMode = (req.nextUrl.searchParams.get('mode')?.trim() as GoogleImportMode | null) || 'appointments-only'

  try {
    const events = await listGoogleCalendarEvents(
      practitionerId,
      req,
      integration.selectedCalendarId,
      from,
      to,
    )

    const rows = buildGoogleBookingImportPreview(
      events,
      integration.selectedCalendarId,
      await patientsRepository.listGoogleImportCandidates(practitionerId),
      await servicesRepository.listGoogleImportCandidates(practitionerId),
      bookingsRepository.listGoogleImportPreviewBookings(practitionerId),
      importMode,
    )

    return NextResponse.json({ rows }, { status: 200 })
  } catch (nextError: unknown) {
    return NextResponse.json({ error: getErrorMessage(nextError, 'Failed to preview Google events') }, { status: 400 })
  }
}
