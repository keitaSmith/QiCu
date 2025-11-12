// lib/fhir/patient-builders.ts
import type { ContactPoint, FhirPatient } from '@/models/fhir/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import { v4 as uuidv4 } from 'uuid'

export type NewPatientForm = {
  firstName: string
  lastName: string
  dob: string            // "YYYY-MM-DD"
  email?: string
  mobile?: string        // prefer E.164 "+41..."
  inviteMode: 'profileOnly' | 'profileAndInvite'
}

export function buildPatientFromForm(input: NewPatientForm, opts?: { createdByUserId?: string; locale?: string }): FhirPatient {
  const id = `P-${uuidv4()}`
  const nameText = `${input.firstName.trim()} ${input.lastName.trim()}`
  const telecom = [
  ...(input.email ? [{ system: 'email' as const, value: input.email, use: 'home' as const }] : []),
  ...(input.mobile ? [{ system: 'phone' as const, value: input.mobile, use: 'mobile' as const }] : []),
] satisfies ContactPoint[]

  const p: FhirPatient = {
    resourceType: 'Patient',
    id,
    meta: { versionId: '1', lastUpdated: new Date().toISOString() },
    active: true,
    name: [{ use: 'official', family: input.lastName.trim(), given: [input.firstName.trim()], text: nameText }],
    telecom,
    birthDate: input.dob,
    communication: opts?.locale ? [{ language: { text: opts.locale }, preferred: true }] : undefined,
    extension: [
      { url: 'https://qicu.app/fhir/StructureDefinition/invitation', valueString: input.inviteMode === 'profileAndInvite' ? 'sent' : 'none' },
      ...(opts?.createdByUserId ? [{ url: 'https://qicu.app/fhir/StructureDefinition/createdBy', valueString: opts.createdByUserId }] : []),
    ],
  }

  // Validate before returning (throws ZodError if invalid)
  FhirPatientSchema.parse(p)
  return p
}

export function archivePatient(p: FhirPatient): FhirPatient {
  return {
    ...p,
    active: false,
    extension: [
      ...(p.extension ?? []),
      { url: 'https://qicu.app/fhir/StructureDefinition/archivedAt', valueDateTime: new Date().toISOString() },
    ],
  }
}

export function unarchivePatient(p: FhirPatient): FhirPatient {
  return { ...p, active: true }
}

