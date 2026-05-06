import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const body = await req.json().catch(() => ({})) as { cancelFutureBookings?: boolean }

  try {
    const result = lifecycleRepository.archivePatient(practitionerId, patientId, {
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
