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
  const body = await req.json().catch(() => ({})) as { cancelFutureBookings?: boolean }

  try {
    const result = await lifecycleRepository.archivePatient(practitionerId, patientId, {
      cancelFutureBookings: body.cancelFutureBookings === true,
    })
    return NextResponse.json(
      {
        ok: true,
        action: 'archived',
        patient: result.patient,
        impact: result.impact,
      },
      { status: 200 },
    )
  } catch {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
}
