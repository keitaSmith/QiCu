import { NextRequest, NextResponse } from 'next/server'

import { patientsStore } from '@/data/patientsStore'
import type { FhirPatient } from '@/models/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params
  const index = patientsStore.findIndex(p => p.id === patientId)

  if (index === -1) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  try {
    const json = await req.json()
    const merged: FhirPatient = {
      ...patientsStore[index],
      ...json,
      id: patientId,
      meta: {
        ...(patientsStore[index].meta ?? {}),
        ...(json?.meta ?? {}),
        lastUpdated: new Date().toISOString(),
      },
    }

    const parsed = FhirPatientSchema.parse(merged)
    patientsStore[index] = parsed

    return NextResponse.json(parsed, { status: 200 })
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        {
          error: 'Invalid FHIR Patient payload',
          issues: err.issues,
        },
        { status: 400 },
      )
    }

    console.error('Error in PATCH /api/patients/[patientId]:', err)
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params
  const index = patientsStore.findIndex(p => p.id === patientId)

  if (index === -1) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const [removed] = patientsStore.splice(index, 1)
  return NextResponse.json(removed, { status: 200 })
}
