import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import type { FhirPatient } from '@/models/patient'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const patient = patientsRepository.getById(practitionerId, patientId)

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  try {
    const body = (await req.json()) as Partial<FhirPatient>
    const parsed = patientsRepository.update(practitionerId, patientId, body)

    return NextResponse.json(parsed, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid FHIR Patient payload',
          issues: err.issues,
        },
        { status: 400 },
      )
    }

    console.error('Error in PATCH /api/patients/[patientId]:', err)
    return NextResponse.json({ error: 'Failed to update patient' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const patient = patientsRepository.getById(practitionerId, patientId)

  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const result = lifecycleRepository.movePatientGraphToTrash(practitionerId, patientId)
  return NextResponse.json(
    {
      ok: true,
      action: 'moved-to-trash',
      restoreUntil: result.restoreUntil,
      deletionGroupId: result.deletionGroupId,
      impact: result.impact,
    },
    { status: 200 },
  )
}
