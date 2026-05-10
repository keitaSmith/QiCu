import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  const { patientId } = await params

  try {
    const payload = await lifecycleRepository.buildPatientExport(practitionerId, patientId)
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="qicu-patient-${patientId}.json"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
}
