import { NextRequest, NextResponse } from 'next/server'
import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'

export async function GET(req: NextRequest) {
  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  const sessions = await sessionsRepository.listByPractitioner(practitionerId)

  return NextResponse.json(sessions, { status: 200 })
}
