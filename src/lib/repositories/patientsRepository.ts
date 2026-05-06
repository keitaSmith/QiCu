import { patientsStore } from '@/data/patientsStore'
import { isTrashed } from '@/lib/dataLifecycle'
import {
  patientBelongsToPractitioner,
  setPatientPractitionerId,
} from '@/lib/practitioners'
import type { FhirPatient } from '@/models/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'

export function listByPractitionerIncludingArchived(practitionerId: string) {
  return patientsStore.filter(
    patient => patientBelongsToPractitioner(patient, practitionerId) && !isTrashed(patient),
  )
}

export function listActiveByPractitioner(practitionerId: string) {
  return listByPractitionerIncludingArchived(practitionerId).filter(
    patient => patient.active !== false,
  )
}

export function getById(practitionerId: string, patientId: string) {
  return (
    patientsStore.find(
      patient =>
        patient.id === patientId &&
        patientBelongsToPractitioner(patient, practitionerId) &&
        !isTrashed(patient),
    ) ?? null
  )
}

export function create(practitionerId: string, input: FhirPatient) {
  const withOwnership = setPatientPractitionerId(input, practitionerId)
  const parsed = FhirPatientSchema.parse(withOwnership)
  patientsStore.unshift(parsed)
  return parsed
}

export function update(
  practitionerId: string,
  patientId: string,
  input: Partial<FhirPatient>,
) {
  const index = patientsStore.findIndex(
    patient =>
      patient.id === patientId &&
      patientBelongsToPractitioner(patient, practitionerId) &&
      !isTrashed(patient),
  )

  if (index === -1) return null

  const safeInput = { ...input }
  delete safeInput.trashMetadata

  const current = patientsStore[index]
  const merged: FhirPatient = setPatientPractitionerId(
    {
      ...current,
      ...safeInput,
      id: patientId,
      meta: {
        ...(current.meta ?? {}),
        ...(safeInput.meta ?? {}),
        lastUpdated: new Date().toISOString(),
      },
    },
    practitionerId,
  )

  const parsed = FhirPatientSchema.parse(merged)
  patientsStore[index] = parsed
  return parsed
}

