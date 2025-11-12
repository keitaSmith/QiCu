// src/models/patient.ts
import type { FhirPatient } from '@/models/fhir/patient'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import { buildPatientFromForm, type NewPatientForm } from '@/lib/fhir/patient-builders'

/** Optional: have all Patients declare your QiCu FHIR profile */
const QICU_PATIENT_PROFILE = 'https://qicu.app/fhir/StructureDefinition/Patient'

function ensureProfile(p: FhirPatient): FhirPatient {
  const cur = p.meta?.profile ?? []
  return {
    ...p,
    meta: { ...(p.meta ?? {}), profile: cur.includes(QICU_PATIENT_PROFILE) ? cur : [QICU_PATIENT_PROFILE, ...cur] },
  }
}

/** ---- Display helpers ---- */
export function displayName(p: FhirPatient): string {
  const n = p.name?.[0]
  if (!n) return '—'
  if (n.text && n.text.trim()) return n.text.trim()
  const given = (n.given?.[0] ?? '').trim()
  const family = (n.family ?? '').trim()
  const out = [given, family].filter(Boolean).join(' ')
  return out || '—'
}

export function primaryEmail(p: FhirPatient): string {
  return p.telecom?.find(t => t.system === 'email')?.value ?? ''
}

export function primaryMobile(p: FhirPatient): string {
  const mobile = p.telecom?.find(t => t.system === 'phone' && t.use === 'mobile')?.value
  return mobile ?? p.telecom?.find(t => t.system === 'phone')?.value ?? ''
}
/** -------------------------------- */

/** Create a FHIR-compliant Patient from form input */
export function create(form: NewPatientForm, opts?: { locale?: string }): FhirPatient {
  const created = buildPatientFromForm(form, opts)
  const withProfile = ensureProfile(created)
  FhirPatientSchema.parse(withProfile)
  return withProfile
}

/** Update a Patient with a partial form patch (pure; validates) */
export function update(p: FhirPatient, patch: Partial<NewPatientForm>): FhirPatient {
  const firstName = (patch.firstName ?? p.name?.[0]?.given?.[0] ?? '').trim()
  const lastName  = (patch.lastName  ?? p.name?.[0]?.family      ?? '').trim()
  const dob       =  patch.dob       ?? p.birthDate

  const email  = patch.email  ?? p.telecom?.find(t => t.system === 'email')?.value
  const mobile = patch.mobile ?? p.telecom?.find(t => t.system === 'phone')?.value

  const updated: FhirPatient = {
    ...p,
    name: [{ use: 'official', family: lastName, given: [firstName], text: `${firstName} ${lastName}`.trim() }],
    birthDate: dob,
    telecom: [
      ...(email  ? [{ system: 'email' as const, value: email,  use: 'home'   as const }] : []),
      ...(mobile ? [{ system: 'phone' as const, value: mobile, use: 'mobile' as const }] : []),
    ],
  }

  const withProfile = ensureProfile(updated)
  FhirPatientSchema.parse(withProfile)
  return withProfile
}

/** Archive = FHIR active=false + archivedAt (+ optional reason) */
export function archive(p: FhirPatient, reason?: string): FhirPatient {
  const now = new Date().toISOString()
  const ext = [
    ...(p.extension ?? []),
    { url: 'https://qicu.app/fhir/StructureDefinition/archivedAt', valueDateTime: now },
    ...(reason ? [{ url: 'https://qicu.app/fhir/StructureDefinition/archiveReason', valueString: reason }] : []),
  ]
  return { ...p, active: false, extension: ext }
}

/** Unarchive = FHIR active=true */
export function unarchive(p: FhirPatient): FhirPatient {
  return { ...p, active: true }
}

/** ----- Two-status helpers (Active / Inactive) ----- */
export type PatientStatus = 'active' | 'inactive'

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

// Re-export the core FHIR type for convenience
export type { FhirPatient } from '@/models/fhir/patient'
