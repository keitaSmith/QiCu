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

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const patients = patientsStore.filter(patient => patientBelongsToPractitioner(patient, practitionerId))
  return NextResponse.json(patients, { status: 200 })
}

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)

  try {
    const body = (await req.json()) as FhirPatient
    const withOwnership = setPatientPractitionerId(body, practitionerId)
    const parsed = FhirPatientSchema.parse(withOwnership)
    patientsStore.unshift(parsed)
    return NextResponse.json(parsed, { status: 201 })
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

    console.error('Error in POST /api/patients:', err)
    return NextResponse.json({ error: 'Failed to create patient' }, { status: 500 })
  }
}
