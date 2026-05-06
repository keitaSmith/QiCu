import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { patientId } = await params

  try {
    const payload = lifecycleRepository.buildPatientExport(practitionerId, patientId)
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
