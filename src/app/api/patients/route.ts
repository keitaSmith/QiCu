// src/app/api/patients/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { patientsStore } from '@/data/patientsStore'
import type { FhirPatient } from '@/models/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'

export async function GET() {
  return NextResponse.json(patientsStore, { status: 200 })
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json()
    const parsed = FhirPatientSchema.parse(json)

    const id =
      parsed.id && parsed.id.trim().length > 0
        ? parsed.id
        : `P-${Date.now().toString()}`

    const patient: FhirPatient = { ...parsed, id }

    patientsStore.unshift(patient)

    return NextResponse.json(patient, { status: 201 })
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

    console.error('Error in POST /api/patients:', err)
    return NextResponse.json(
      { error: 'Failed to create patient' },
      { status: 500 },
    )
  }
}
