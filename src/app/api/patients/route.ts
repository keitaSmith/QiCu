import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import type { FhirPatient } from '@/models/patient'
import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as patientsRepository from '@/lib/repositories/patientsRepository'

export async function GET(req: NextRequest) {
  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  const patients = await patientsRepository.listByPractitionerIncludingArchived(practitionerId)
  return NextResponse.json(patients, { status: 200 })
}

export async function POST(req: NextRequest) {
  const originResponse = mutatingOriginGuardResponse(req)
  if (originResponse) return originResponse

  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId

  try {
    const body = (await req.json()) as FhirPatient
    const parsed = await patientsRepository.create(practitionerId, body)
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
