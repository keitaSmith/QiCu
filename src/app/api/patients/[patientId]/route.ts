import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { patientsStore } from '@/data/patientsStore'
import type { FhirPatient } from '@/models/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import {
  getPractitionerIdFromRequest,
  patientBelongsToPractitioner,
  setPatientPractitionerId,
} from '@/lib/practitioners'
import { isTrashed, movePatientGraphToTrash } from '@/lib/dataLifecycle'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const index = patientsStore.findIndex(
    patient => patient.id === patientId && patientBelongsToPractitioner(patient, practitionerId) && !isTrashed(patient),
  )

  if (index === -1) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  try {
    const safeJson = { ...((await req.json()) as Partial<FhirPatient>) }
    delete safeJson.trashMetadata
    const merged: FhirPatient = setPatientPractitionerId(
      {
        ...patientsStore[index],
        ...safeJson,
        id: patientId,
        meta: {
          ...(patientsStore[index].meta ?? {}),
          ...(safeJson?.meta ?? {}),
          lastUpdated: new Date().toISOString(),
        },
      },
      practitionerId,
    )

    const parsed = FhirPatientSchema.parse(merged)
    patientsStore[index] = parsed

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
  const index = patientsStore.findIndex(
    patient => patient.id === patientId && patientBelongsToPractitioner(patient, practitionerId) && !isTrashed(patient),
  )

  if (index === -1) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const result = movePatientGraphToTrash(patientId, practitionerId)
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
