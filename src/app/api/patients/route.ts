// src/app/api/patients/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PATIENTS } from '@/data/patients';
import type { FhirPatient } from '@/models/patient';
import { FhirPatientSchema } from '@/schemas/fhir/patient';

// For now, use an in-memory store seeded from your fixtures.
// No database, no persistence — this is just the API boundary.
let patientsStore: FhirPatient[] = [...PATIENTS];

// GET /api/patients → return all FHIR Patients
export async function GET() {
  return NextResponse.json(patientsStore, { status: 200 });
}

// POST /api/patients → accept a FHIR Patient, validate with Zod, add to store
export async function POST(req: NextRequest) {
  try {
    const json = await req.json();

    // Validate against your existing FHIR schema
    const parsed = FhirPatientSchema.parse(json);

    // Ensure there is an ID
    const id = (parsed.id && parsed.id.trim().length > 0)
      ? parsed.id
      : `P-${Date.now().toString()}`;

    const patient: FhirPatient = { ...parsed, id };

    patientsStore.push(patient);

    return NextResponse.json(patient, { status: 201 });
  } catch (err: any) {
    // Zod validation error
    if (err?.name === 'ZodError') {
      return NextResponse.json(
        {
          error: 'Invalid FHIR Patient payload',
          issues: err.issues,
        },
        { status: 400 },
      );
    }

    // Anything else
    console.error('Error in POST /api/patients:', err);
    return NextResponse.json(
      { error: 'Failed to create patient' },
      { status: 500 },
    );
  }
}
