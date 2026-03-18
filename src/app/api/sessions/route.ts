import { NextRequest, NextResponse } from 'next/server'
import { sessionsStore } from '@/data/sessionsStore'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const sessions = [...sessionsStore]
    .filter(session => session.practitionerId === practitionerId)
    .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())

  return NextResponse.json(sessions, { status: 200 })
}
