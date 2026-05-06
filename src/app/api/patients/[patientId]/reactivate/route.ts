import { NextRequest, NextResponse } from 'next/server'

import { reactivatePatient } from '@/lib/dataLifecycle'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params

  try {
    const patient = reactivatePatient(patientId, practitionerId)
    return NextResponse.json({ ok: true, action: 'reactivated', patient }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
}
