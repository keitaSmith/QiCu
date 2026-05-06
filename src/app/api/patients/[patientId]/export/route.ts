import { NextRequest, NextResponse } from 'next/server'

import { buildPatientFullExport } from '@/lib/dataLifecycle'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params

  try {
    const payload = buildPatientFullExport(patientId, practitionerId)
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
