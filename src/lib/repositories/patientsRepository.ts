import { and, eq, isNull, or } from 'drizzle-orm'

import { patientsStore } from '@/data/patientsStore'
import { drizzleDb } from '@/db/client'
import { patients } from '@/db/schema'
import { demoPatientIds, demoPractitionerIds } from '@/db/seeds/ids'
import { isTrashed } from '@/lib/dataLifecycle'
import {
  getPatientPractitionerId,
  patientBelongsToPractitioner,
  setPatientPractitionerId,
} from '@/lib/practitioners'
import { toCoreView } from '@/models/patient.coreView'
import { FhirPatientSchema } from '@/schemas/fhir/patient'
import type { FhirPatient } from '@/models/patient'

const publicPractitionerIdToDatabaseId = demoPractitionerIds
const publicPatientIdToDatabaseId = demoPatientIds
const databasePatientIdToPublicId = Object.fromEntries(
  Object.entries(publicPatientIdToDatabaseId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>
const databasePractitionerIdToPublicId = Object.fromEntries(
  Object.entries(publicPractitionerIdToDatabaseId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

type PatientRow = typeof patients.$inferSelect

function databasePractitionerId(practitionerId: string) {
  return publicPractitionerIdToDatabaseId[
    practitionerId as keyof typeof publicPractitionerIdToDatabaseId
  ]
}

function databasePatientId(patientId: string) {
  return publicPatientIdToDatabaseId[patientId as keyof typeof publicPatientIdToDatabaseId] ?? patientId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

function patientIdCondition(patientId: string) {
  const dbPatientId = databasePatientId(patientId)
  if (dbPatientId !== patientId || isUuid(patientId)) {
    return or(eq(patients.id, dbPatientId), eq(patients.publicId, patientId))
  }
  return eq(patients.publicId, patientId)
}

function publicPatientIdForRow(row: PatientRow) {
  return row.publicId ?? databasePatientIdToPublicId[row.id] ?? row.id
}

function publicPractitionerIdForRow(row: PatientRow) {
  return databasePractitionerIdToPublicId[row.practitionerId] ?? row.practitionerId
}

function asFhirJson(value: unknown): Partial<FhirPatient> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<FhirPatient>)
    : {}
}

function preferredLanguageFrom(patient: FhirPatient) {
  return patient.communication?.find(item => item.preferred)?.language.text ??
    patient.communication?.[0]?.language.text
}

function primaryPhoneFrom(patient: FhirPatient) {
  return patient.telecom?.find(item => item.system === 'phone')?.value
}

function primaryEmailFrom(patient: FhirPatient) {
  return patient.telecom?.find(item => item.system === 'email')?.value
}

function validGender(value: string | null) {
  return value === 'male' ||
    value === 'female' ||
    value === 'other' ||
    value === 'prefer_not_to_say'
    ? value
    : undefined
}

function namePartsFrom(patient: FhirPatient) {
  const name = patient.name[0]
  const firstName = name.given?.[0] ?? null
  const lastName = name.family ?? null
  const displayName =
    name.text?.trim() ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    patient.id

  return { firstName, lastName, displayName }
}

function buildSearchText(patient: FhirPatient) {
  const { firstName, lastName, displayName } = namePartsFrom(patient)
  return [
    patient.id,
    displayName,
    firstName,
    lastName,
    primaryEmailFrom(patient),
    primaryPhoneFrom(patient),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function rowValuesForPatient(patient: FhirPatient, dbPractitionerId: string) {
  const { firstName, lastName, displayName } = namePartsFrom(patient)

  return {
    publicId: patient.id,
    practitionerId: dbPractitionerId,
    active: patient.active ?? true,
    firstName,
    lastName,
    displayName,
    birthDate: patient.birthDate ?? null,
    gender: patient.gender ?? null,
    phone: primaryPhoneFrom(patient) ?? null,
    email: primaryEmailFrom(patient) ?? null,
    preferredLanguage: preferredLanguageFrom(patient) ?? null,
    fhirJson: patient as unknown as Record<string, unknown>,
    searchText: buildSearchText(patient),
    archivedAt: patient.active === false ? new Date() : null,
  }
}

function toPublicPatient(row: PatientRow): FhirPatient {
  const publicId = publicPatientIdForRow(row)
  const source = asFhirJson(row.fhirJson)
  const displayName = row.displayName || publicId
  const firstName = row.firstName ?? undefined
  const lastName = row.lastName ?? undefined
  const patient: FhirPatient = {
    ...source,
    resourceType: 'Patient',
    id: publicId,
    active: row.active,
    meta: source.meta ?? {
      lastUpdated: row.updatedAt?.toISOString(),
    },
    name:
      source.name && source.name.length > 0
        ? source.name
        : [
            {
              text: displayName,
              family: lastName,
              given: firstName ? [firstName] : undefined,
            },
          ],
    birthDate: source.birthDate ?? row.birthDate ?? undefined,
    gender: source.gender ?? validGender(row.gender),
    telecom:
      source.telecom ??
      [
        row.phone ? { system: 'phone' as const, value: row.phone } : null,
        row.email ? { system: 'email' as const, value: row.email } : null,
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    communication:
      source.communication ??
      (row.preferredLanguage
        ? [{ language: { text: row.preferredLanguage }, preferred: true }]
        : undefined),
  }

  const withPractitioner = setPatientPractitionerId(patient, publicPractitionerIdForRow(row))
  return FhirPatientSchema.parse(withPractitioner)
}

function rememberRuntimePatient(patient: FhirPatient) {
  const practitionerId = getPatientPractitionerId(patient)
  const index = patientsStore.findIndex(
    item => item.id === patient.id && getPatientPractitionerId(item) === practitionerId,
  )
  const next = { ...patient }

  if (index === -1) {
    patientsStore.unshift(next)
  } else if (!isTrashed(patientsStore[index])) {
    patientsStore[index] = {
      ...patientsStore[index],
      ...next,
    }
  }

  return patient
}

function rememberRuntimePatients(patientList: FhirPatient[]) {
  for (const patient of patientList) rememberRuntimePatient(patient)
  return patientList
}

function fallbackListByPractitionerIncludingArchived(practitionerId: string) {
  return patientsStore.filter(
    patient => patientBelongsToPractitioner(patient, practitionerId) && !isTrashed(patient),
  )
}

function fallbackListGoogleImportCandidates(practitionerId: string) {
  return patientsStore
    .filter(patient => patientBelongsToPractitioner(patient, practitionerId))
    .map(toCoreView)
}

function fallbackGetById(practitionerId: string, patientId: string) {
  return (
    patientsStore.find(
      patient =>
        patient.id === patientId &&
        patientBelongsToPractitioner(patient, practitionerId) &&
        !isTrashed(patient),
    ) ?? null
  )
}

function fallbackCreate(practitionerId: string, input: FhirPatient) {
  const parsed = FhirPatientSchema.parse(setPatientPractitionerId(input, practitionerId))
  patientsStore.unshift(parsed)
  return parsed
}

function fallbackUpdate(
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
  const next = setPatientPractitionerId(
    {
      ...patientsStore[index],
      ...safeInput,
      id: patientId,
      meta: {
        ...(patientsStore[index].meta ?? {}),
        ...(safeInput.meta ?? {}),
        lastUpdated: new Date().toISOString(),
      },
    },
    practitionerId,
  )
  const parsed = FhirPatientSchema.parse(next)
  patientsStore[index] = parsed
  return parsed
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

export async function listByPractitionerIncludingArchived(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListByPractitionerIncludingArchived(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(patients)
        .where(and(eq(patients.practitionerId, dbPractitionerId), isNull(patients.deletedAt)))
      return rememberRuntimePatients(rows.map(toPublicPatient))
    },
    () => fallbackListByPractitionerIncludingArchived(practitionerId),
  )
}

export async function listActiveByPractitioner(practitionerId: string) {
  return (await listByPractitionerIncludingArchived(practitionerId)).filter(
    patient => patient.active !== false,
  )
}

export async function listGoogleImportCandidates(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListGoogleImportCandidates(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(patients)
        .where(eq(patients.practitionerId, dbPractitionerId))
      return rows.map(toPublicPatient).map(toCoreView)
    },
    () => fallbackListGoogleImportCandidates(practitionerId),
  )
}

export async function getById(practitionerId: string, patientId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackGetById(practitionerId, patientId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(patients)
        .where(
          and(
            patientIdCondition(patientId),
            eq(patients.practitionerId, dbPractitionerId),
            isNull(patients.deletedAt),
          ),
        )
        .limit(1)

      return rows[0] ? rememberRuntimePatient(toPublicPatient(rows[0])) : null
    },
    () => fallbackGetById(practitionerId, patientId),
  )
}

export async function create(practitionerId: string, input: FhirPatient) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackCreate(practitionerId, input)

  const parsed = FhirPatientSchema.parse(setPatientPractitionerId(input, practitionerId))
  const fixedDatabaseId = publicPatientIdToDatabaseId[parsed.id as keyof typeof publicPatientIdToDatabaseId]

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .insert(patients)
        .values({
          ...(fixedDatabaseId ? { id: fixedDatabaseId } : {}),
          ...rowValuesForPatient(parsed, dbPractitionerId),
        })
        .returning()
      return rememberRuntimePatient(toPublicPatient(rows[0]))
    },
    () => fallbackCreate(practitionerId, input),
  )
}

export async function update(
  practitionerId: string,
  patientId: string,
  input: Partial<FhirPatient>,
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackUpdate(practitionerId, patientId, input)

  const current = await getById(practitionerId, patientId)
  if (!current) return null

  const safeInput = { ...input }
  delete safeInput.trashMetadata
  const parsed = FhirPatientSchema.parse(
    setPatientPractitionerId(
      {
        ...current,
        ...safeInput,
        id: current.id,
        meta: {
          ...(current.meta ?? {}),
          ...(safeInput.meta ?? {}),
          lastUpdated: new Date().toISOString(),
        },
      },
      practitionerId,
    ),
  )

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .update(patients)
        .set({
          ...rowValuesForPatient(parsed, dbPractitionerId),
          updatedAt: new Date(),
        })
        .where(
          and(
            patientIdCondition(patientId),
            eq(patients.practitionerId, dbPractitionerId),
            isNull(patients.deletedAt),
          ),
        )
        .returning()
      return rows[0] ? rememberRuntimePatient(toPublicPatient(rows[0])) : null
    },
    () => fallbackUpdate(practitionerId, patientId, input),
  )
}

export async function syncRuntimePatientToDatabase(practitionerId: string, patientId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return

  const runtimePatient = patientsStore.find(
    patient => patient.id === patientId && patientBelongsToPractitioner(patient, practitionerId),
  )
  if (!runtimePatient) return

  await runWithFallback(
    async () => {
      await drizzleDb
        .update(patients)
        .set({
          ...rowValuesForPatient(runtimePatient, dbPractitionerId),
          deletedAt: runtimePatient.trashMetadata?.deletedAt
            ? new Date(runtimePatient.trashMetadata.deletedAt)
            : null,
          restoreUntil: runtimePatient.trashMetadata?.restoreUntil
            ? new Date(runtimePatient.trashMetadata.restoreUntil)
            : null,
          deletedByPractitionerId: runtimePatient.trashMetadata?.deletedByPractitionerId
            ? databasePractitionerId(runtimePatient.trashMetadata.deletedByPractitionerId) ?? null
            : null,
          deletionGroupId: null,
          deletionType: runtimePatient.trashMetadata?.deletionType ?? null,
          deletionReason: runtimePatient.trashMetadata?.deletionReason ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            patientIdCondition(patientId),
            eq(patients.practitionerId, dbPractitionerId),
          ),
        )
    },
    () => undefined,
  )
}
