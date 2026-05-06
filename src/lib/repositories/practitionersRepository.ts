import { asc, eq } from 'drizzle-orm'

import { drizzleDb } from '@/db/client'
import { practitioners } from '@/db/schema'
import { demoPractitionerIds } from '@/db/seeds/ids'
import type { Practitioner } from '@/lib/practitioners'

const publicIdToDatabaseId = demoPractitionerIds

const databaseIdToPublicId = Object.fromEntries(
  Object.entries(publicIdToDatabaseId).map(([publicId, databaseId]) => [databaseId, publicId]),
) as Record<string, string>

const fallbackPractitioners: Practitioner[] = [
  {
    id: 'prac-tom-cook',
    name: 'Tom Cook',
    email: 'tom.cook@qicu-demo.test',
    initials: 'TC',
    avatarUrl:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
  },
  {
    id: 'prac-keita-smith',
    name: 'Keita Smith',
    email: 'keita.smith@qicu-demo.test',
    initials: 'KS',
    icon: 'sparkles',
  },
]

export const DEFAULT_PRACTITIONER_PUBLIC_ID = fallbackPractitioners[0].id

type PractitionerRow = typeof practitioners.$inferSelect

function toPublicPractitioner(row: PractitionerRow): Practitioner {
  return {
    id: databaseIdToPublicId[row.id] ?? row.id,
    name: row.displayName,
    email: row.email ?? '',
    initials: row.initials ?? '',
    avatarUrl: row.avatarUrl ?? undefined,
    icon: row.icon === 'sparkles' || row.icon === 'user-circle' ? row.icon : undefined,
  }
}

function toDatabaseId(practitionerId: string) {
  return publicIdToDatabaseId[practitionerId as keyof typeof publicIdToDatabaseId] ?? practitionerId
}

function fallbackById(practitionerId: string) {
  return fallbackPractitioners.find(practitioner => practitioner.id === practitionerId) ?? null
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch {
    return fallback()
  }
}

export async function listPractitioners() {
  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(practitioners)
        .orderBy(asc(practitioners.displayName))

      if (rows.length === 0) return fallbackPractitioners
      return rows.map(toPublicPractitioner)
    },
    () => fallbackPractitioners,
  )
}

export async function getById(practitionerId: string) {
  const trimmed = practitionerId.trim()
  if (!trimmed) return null

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(practitioners)
        .where(eq(practitioners.id, toDatabaseId(trimmed)))
        .limit(1)

      return rows[0] ? toPublicPractitioner(rows[0]) : null
    },
    () => fallbackById(trimmed),
  )
}

export async function isKnownPractitioner(practitionerId: string) {
  return (await getById(practitionerId)) !== null
}

export async function getByIdOrDefault(practitionerId?: string | null) {
  const trimmed = practitionerId?.trim()
  if (trimmed) {
    const practitioner = await getById(trimmed)
    if (practitioner) return practitioner
  }

  return (await getById(DEFAULT_PRACTITIONER_PUBLIC_ID)) ?? fallbackPractitioners[0]
}

export async function normalizePractitionerId(practitionerId?: string | null) {
  return (await getByIdOrDefault(practitionerId)).id
}

