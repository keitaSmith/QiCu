import { NextRequest, NextResponse } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { patientsStore } from '@/data/patientsStore'
import { servicesStore } from '@/data/servicesStore'
import { listGoogleCalendarEvents } from '@/lib/google/calendarApi'
import { buildGoogleBookingImportPreview } from '@/lib/google/eventMapping'
import type { GoogleImportMode } from '@/lib/google/types'
import { getGoogleIntegration } from '@/lib/google/store'
import { patientBelongsToPractitioner, serviceBelongsToPractitioner, getPractitionerIdFromRequest } from '@/lib/practitioners'
import { toCoreView } from '@/models/patient.coreView'

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
  const practitionerId = getPractitionerIdFromRequest(req)
  const integration = getGoogleIntegration(practitionerId)

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
      patientsStore.filter(patient => patientBelongsToPractitioner(patient, practitionerId)).map(toCoreView),
      servicesStore.filter(service => serviceBelongsToPractitioner(service, practitionerId)),
      BOOKINGS.filter(booking => booking.practitionerId === practitionerId),
      importMode,
    )

    return NextResponse.json({ rows }, { status: 200 })
  } catch (nextError: any) {
    return NextResponse.json({ error: nextError?.message ?? 'Failed to preview Google events' }, { status: 400 })
  }
}
