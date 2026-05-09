import { NextRequest, NextResponse } from 'next/server'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'

export async function GET(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const sessions = await sessionsRepository.listByPractitioner(practitionerId)

  return NextResponse.json(sessions, { status: 200 })
}
