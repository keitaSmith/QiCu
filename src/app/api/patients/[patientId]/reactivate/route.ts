import { NextRequest, NextResponse } from 'next/server'

import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const originResponse = mutatingOriginGuardResponse(req)
  if (originResponse) return originResponse

  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  const { patientId } = await params

  try {
    const patient = await lifecycleRepository.reactivatePatient(practitionerId, patientId)
    return NextResponse.json({ ok: true, action: 'reactivated', patient }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
}
