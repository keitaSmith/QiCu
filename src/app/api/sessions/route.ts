import { NextRequest, NextResponse } from 'next/server'
import { sessionsStore } from '@/data/sessionsStore'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import { isTrashed } from '@/lib/dataLifecycle'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const sessions = [...sessionsStore]
    .filter(session => session.practitionerId === practitionerId && !isTrashed(session))
    .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())

  return NextResponse.json(sessions, { status: 200 })
}
