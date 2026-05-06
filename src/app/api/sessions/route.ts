import { NextRequest, NextResponse } from 'next/server'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const sessions = sessionsRepository.listByPractitioner(practitionerId)

  return NextResponse.json(sessions, { status: 200 })
}
