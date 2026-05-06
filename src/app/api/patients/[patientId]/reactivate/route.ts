import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params

  try {
    const patient = lifecycleRepository.reactivatePatient(practitionerId, patientId)
    return NextResponse.json({ ok: true, action: 'reactivated', patient }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }
}
