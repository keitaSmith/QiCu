// src/models/patient.ts

import type { FhirPatient } from '@/models/fhir/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import {
  buildPatientFromForm,
  type NewPatientForm,
  archivePatient,
  unarchivePatient,
} from '@/lib/fhir/patient-builders'

/* ------------------------------------------------------------------ */
/* Domain model (internal Patient)                                    */
/* ------------------------------------------------------------------ */

export type PatientStatus = 'active' | 'inactive'

/**
 * Clean internal Patient model for QiCu.
 * Use this in your UI and business logic instead of raw FHIR.
 */
export type Patient = {
  id: string
  firstName: string
  lastName: string
  fullName: string
  birthDate?: string
  email?: string
  mobile?: string
  status: PatientStatus
}

/* ------------------------------------------------------------------ */
/* FHIR profile helper                                                */
/* ------------------------------------------------------------------ */

const QICU_PATIENT_PROFILE = 'https://qicu.app/fhir/StructureDefinition/Patient'

function ensureProfile(p: FhirPatient): FhirPatient {
  const cur = p.meta?.profile ?? []
  return {
    ...p,
    meta: {
      ...(p.meta ?? {}),
      profile: cur.includes(QICU_PATIENT_PROFILE)
        ? cur
        : [QICU_PATIENT_PROFILE, ...cur],
    },
  }
}

/* ------------------------------------------------------------------ */
/* FHIR → domain helpers (used by UI & exports)                       */
/* ------------------------------------------------------------------ */

export function displayName(p: FhirPatient): string {
  const n = p.name?.[0]
  if (!n) return 'Unknown'

  if (n.text && n.text.trim().length > 0) return n.text

  const given = n.given?.[0]
  const family = n.family
  const parts = [given, family].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Unknown'
}

export function primaryEmail(p: FhirPatient): string {
  return p.telecom?.find(t => t.system === 'email')?.value ?? ''
}

export function primaryMobile(p: FhirPatient): string {
  const t = p.telecom?.find(
    t =>
      t.system === 'phone' &&
      (t.use === 'mobile' || t.use === undefined || t.use === null),
  )
  return t?.value ?? ''
}

export function status(p: FhirPatient): PatientStatus {
  return p.active === false ? 'inactive' : 'active'
}

export function statusLabel(s: PatientStatus) {
  return s === 'inactive' ? 'Inactive' : 'Active'
}

/** Map to your UI StatusBadge props */
export function statusBadgeTone(s: PatientStatus): 'success' | 'danger' {
  return s === 'inactive' ? 'danger' : 'success'
}

/* ------------------------------------------------------------------ */
/* FHIR → domain mapping                                              */
/* ------------------------------------------------------------------ */

export function fromFhir(p: FhirPatient): Patient {
  const n = p.name?.[0]
  const firstName = n?.given?.[0] ?? ''
  const lastName = n?.family ?? ''
  const fullName = displayName(p)

  return {
    id: p.id!, // FhirPatientSchema enforces non-empty id
    firstName,
    lastName,
    fullName,
    birthDate: p.birthDate,
    email: primaryEmail(p) || undefined,
    mobile: primaryMobile(p) || undefined,
    status: status(p),
  }
}

export function fromFhirList(list: FhirPatient[]): Patient[] {
  return list.map(fromFhir)
}

/* ------------------------------------------------------------------ */
/* Creation / update helpers used by the dialog                       */
/* ------------------------------------------------------------------ */

/**
 * Build a NEW FHIR Patient from a NewPatientForm.
 * Use this when creating patients from the dialog.
 */
export function create(
  form: NewPatientForm,
  opts?: { createdByUserId?: string; locale?: string },
): FhirPatient {
  const raw = buildPatientFromForm(form, opts)
  const withProfile = ensureProfile(raw)
  return FhirPatientSchema.parse(withProfile)
}

/**
 * Update an existing FHIR Patient from a NewPatientForm.
 * Keeps the same id and carries over meta where sensible.
 */
export function update(
  existing: FhirPatient,
  form: NewPatientForm,
  opts?: { createdByUserId?: string; locale?: string },
): FhirPatient {
  const rebuilt = buildPatientFromForm(form, opts)

  const merged: FhirPatient = {
    ...rebuilt,
    id: existing.id, // keep id
    meta: existing.meta ?? rebuilt.meta,
  }

  const withProfile = ensureProfile(merged)
  return FhirPatientSchema.parse(withProfile)
}

/**
 * Archive / unarchive wrappers so existing calls
 * Patient.archive(p) / Patient.unarchive(p) keep working.
 */
export function archive(p: FhirPatient): FhirPatient {
  return archivePatient(p)
}

export function unarchive(p: FhirPatient): FhirPatient {
  return unarchivePatient(p)
}

/* ------------------------------------------------------------------ */
/* Re-export FHIR type so existing imports stay valid                 */
/* ------------------------------------------------------------------ */

export type { FhirPatient } from '@/models/fhir/patient'
