import { NextRequest, NextResponse } from 'next/server'

import { archivePatient } from '@/lib/dataLifecycle'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const body = await req.json().catch(() => ({})) as { cancelFutureBookings?: boolean }

  try {
    const result = archivePatient(patientId, practitionerId, {
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
