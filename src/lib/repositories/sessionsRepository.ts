import { and, eq, inArray, isNull, or } from 'drizzle-orm'

import { BOOKINGS } from '@/data/bookings'
import { sessionsStore } from '@/data/sessionsStore'
import { drizzleDb } from '@/db/client'
import {
  bookings as bookingsTable,
  patients,
  services,
  sessions as sessionsTable,
} from '@/db/schema'
import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
  demoSessionIds,
} from '@/db/seeds/ids'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { isTrashed, moveSessionToTrash } from '@/lib/dataLifecycle'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import type { TrashMetadata } from '@/models/lifecycle'
import type { BasicVitals, Session, TcmFindings } from '@/models/session'

export type CreateSessionInput = {
  patientId: string
  startDateTime?: string
  serviceId?: string
  serviceName?: string
  chiefComplaint?: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  painScore?: number
  tcmDiagnosis?: string
  tcmFindings?: TcmFindings
  pointsUsed?: string[]
  techniques?: string[]
  basicVitals?: BasicVitals
  bookingId?: string | null
  id?: string
}

export type UpdateSessionInput = {
  startDateTime?: string
  serviceId?: string
  serviceName?: string
  chiefComplaint?: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  painScore?: number
  tcmDiagnosis?: string
  tcmFindings?: TcmFindings
  pointsUsed?: string[]
  techniques?: string[]
  basicVitals?: BasicVitals
  bookingId?: string | null
}

type SessionRow = typeof sessionsTable.$inferSelect
type SessionMaps = {
  patientPublicIds: Map<string, string>
  servicePublicIds: Map<string, string>
  bookingPublicIds: Map<string, string>
}

const publicPractitionerIdToDatabaseId = demoPractitionerIds
const publicPatientIdToDatabaseId = demoPatientIds
const publicServiceIdToDatabaseId = demoServiceIds
const publicBookingIdToDatabaseId = demoBookingIds
const publicSessionIdToDatabaseId = demoSessionIds

const databasePractitionerIdToPublicId = reverse(publicPractitionerIdToDatabaseId)
const databasePatientIdToPublicId = reverse(publicPatientIdToDatabaseId)
const databaseServiceIdToPublicId = reverse(publicServiceIdToDatabaseId)
const databaseBookingIdToPublicId = reverse(publicBookingIdToDatabaseId)
const databaseSessionIdToPublicId = reverse(publicSessionIdToDatabaseId)

function reverse<T extends Record<string, string>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([publicId, databaseId]) => [databaseId, publicId])) as Record<
    string,
    string
  >
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT)
}

function shouldUseDatabase() {
  return !isTestRuntime()
}

function databasePractitionerId(practitionerId: string) {
  return publicPractitionerIdToDatabaseId[
    practitionerId as keyof typeof publicPractitionerIdToDatabaseId
  ]
}

function databaseSessionId(sessionId: string) {
  return publicSessionIdToDatabaseId[sessionId as keyof typeof publicSessionIdToDatabaseId] ?? sessionId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

function sessionIdCondition(sessionId: string) {
  const dbSessionId = databaseSessionId(sessionId)
  if (dbSessionId !== sessionId || isUuid(sessionId)) {
    return or(eq(sessionsTable.id, dbSessionId), eq(sessionsTable.publicId, sessionId))
  }
  return eq(sessionsTable.publicId, sessionId)
}

function dateOrNull(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function publicPractitionerIdForRow(row: SessionRow) {
  return databasePractitionerIdToPublicId[row.practitionerId] ?? row.practitionerId
}

function publicSessionIdForRow(row: SessionRow) {
  return row.publicId ?? databaseSessionIdToPublicId[row.id] ?? row.id
}

function trashMetadataForRow(row: SessionRow, practitionerId: string): Session['trashMetadata'] {
  if (!row.deletedAt || !row.restoreUntil) return undefined

  return {
    deletedAt: row.deletedAt.toISOString(),
    restoreUntil: row.restoreUntil.toISOString(),
    deletedByPractitionerId:
      (row.deletedByPractitionerId && databasePractitionerIdToPublicId[row.deletedByPractitionerId]) ??
      practitionerId,
    deletionGroupId: row.deletionGroupId ?? `db-session-trash-${row.id}`,
    deletionType: (row.deletionType as TrashMetadata['deletionType'] | null) ?? 'session',
    deletionReason: row.deletionReason ?? undefined,
  }
}

function toPublicSession(row: SessionRow, maps: SessionMaps): Session {
  const practitionerId = publicPractitionerIdForRow(row)

  return {
    id: publicSessionIdForRow(row),
    practitionerId,
    patientId:
      maps.patientPublicIds.get(row.patientId) ??
      databasePatientIdToPublicId[row.patientId] ??
      row.patientId,
    bookingId: row.bookingId
      ? maps.bookingPublicIds.get(row.bookingId) ??
        databaseBookingIdToPublicId[row.bookingId] ??
        row.bookingId
      : null,
    serviceId: row.serviceId
      ? maps.servicePublicIds.get(row.serviceId) ??
        databaseServiceIdToPublicId[row.serviceId] ??
        row.serviceId
      : undefined,
    serviceName: row.serviceName ?? undefined,
    startDateTime: row.startAt.toISOString(),
    chiefComplaint: row.chiefComplaint,
    treatmentSummary: row.treatmentSummary ?? undefined,
    outcome: row.outcome ?? undefined,
    treatmentNotes: row.treatmentNotes ?? undefined,
    painScore: row.painScore ?? undefined,
    tcmDiagnosis: row.tcmDiagnosis ?? undefined,
    tcmFindings: row.tcmFindings as TcmFindings | undefined,
    pointsUsed: row.pointsUsed ?? undefined,
    techniques: row.techniques ?? undefined,
    basicVitals: row.basicVitals as BasicVitals | undefined,
    trashMetadata: trashMetadataForRow(row, practitionerId),
  }
}

function rememberRuntimeSession(session: Session) {
  const index = sessionsStore.findIndex(
    item => item.id === session.id && item.practitionerId === session.practitionerId,
  )

  if (index === -1) {
    sessionsStore.unshift(session)
  } else if (!isTrashed(sessionsStore[index]) || session.trashMetadata) {
    sessionsStore[index] = {
      ...sessionsStore[index],
      ...session,
    }
  }

  return session
}

function rememberRuntimeSessions(sessionList: Session[]) {
  for (const session of sessionList) rememberRuntimeSession(session)
  return sessionList
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

async function loadPublicIdMaps(rows: SessionRow[]): Promise<SessionMaps> {
  const patientIds = [...new Set(rows.map(row => row.patientId))]
  const serviceIds = [...new Set(rows.map(row => row.serviceId).filter((id): id is string => Boolean(id)))]
  const bookingIds = [...new Set(rows.map(row => row.bookingId).filter((id): id is string => Boolean(id)))]
  const patientPublicIds = new Map<string, string>()
  const servicePublicIds = new Map<string, string>()
  const bookingPublicIds = new Map<string, string>()

  if (patientIds.length > 0) {
    const patientRows = await drizzleDb
      .select({ id: patients.id, publicId: patients.publicId })
      .from(patients)
      .where(inArray(patients.id, patientIds))
    for (const patient of patientRows) {
      if (patient.publicId) patientPublicIds.set(patient.id, patient.publicId)
    }
  }

  if (serviceIds.length > 0) {
    const serviceRows = await drizzleDb
      .select({ id: services.id, publicId: services.publicId })
      .from(services)
      .where(inArray(services.id, serviceIds))
    for (const service of serviceRows) {
      if (service.publicId) servicePublicIds.set(service.id, service.publicId)
    }
  }

  if (bookingIds.length > 0) {
    const bookingRows = await drizzleDb
      .select({ id: bookingsTable.id, publicId: bookingsTable.publicId })
      .from(bookingsTable)
      .where(inArray(bookingsTable.id, bookingIds))
    for (const booking of bookingRows) {
      if (booking.publicId) bookingPublicIds.set(booking.id, booking.publicId)
    }
  }

  return { patientPublicIds, servicePublicIds, bookingPublicIds }
}

async function mapRows(rows: SessionRow[]) {
  const maps = await loadPublicIdMaps(rows)
  return rows.map(row => toPublicSession(row, maps))
}

async function resolveDatabasePatientId(dbPractitionerId: string, patientId: string) {
  const fixedId = publicPatientIdToDatabaseId[patientId as keyof typeof publicPatientIdToDatabaseId]
  if (fixedId) return fixedId

  const rows = await drizzleDb
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.practitionerId, dbPractitionerId),
        isUuid(patientId) ? or(eq(patients.id, patientId), eq(patients.publicId, patientId)) : eq(patients.publicId, patientId),
      ),
    )
    .limit(1)

  return rows[0]?.id ?? null
}

async function resolveDatabaseServiceId(dbPractitionerId: string, serviceId?: string | null) {
  if (!serviceId) return null
  const fixedId = publicServiceIdToDatabaseId[serviceId as keyof typeof publicServiceIdToDatabaseId]
  if (fixedId) return fixedId

  const rows = await drizzleDb
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.practitionerId, dbPractitionerId),
        isUuid(serviceId) ? or(eq(services.id, serviceId), eq(services.publicId, serviceId)) : eq(services.publicId, serviceId),
      ),
    )
    .limit(1)

  return rows[0]?.id ?? null
}

async function resolveDatabaseBookingId(dbPractitionerId: string, bookingId?: string | null) {
  if (!bookingId) return null
  const fixedId = publicBookingIdToDatabaseId[bookingId as keyof typeof publicBookingIdToDatabaseId]
  if (fixedId) return fixedId

  const rows = await drizzleDb
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.practitionerId, dbPractitionerId),
        isUuid(bookingId) ? or(eq(bookingsTable.id, bookingId), eq(bookingsTable.publicId, bookingId)) : eq(bookingsTable.publicId, bookingId),
      ),
    )
    .limit(1)

  return rows[0]?.id ?? null
}

function fallbackListByPractitioner(practitionerId: string) {
  return [...sessionsStore]
    .filter(session => session.practitionerId === practitionerId && !isTrashed(session))
    .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())
}

function fallbackGetById(practitionerId: string, sessionId: string) {
  return (
    sessionsStore.find(
      session =>
        session.id === sessionId &&
        session.practitionerId === practitionerId &&
        !isTrashed(session),
    ) ?? null
  )
}

function fallbackUnlinkBooking(practitionerId: string, bookingId: string) {
  for (const session of sessionsStore) {
    if (session.bookingId === bookingId && session.practitionerId === practitionerId && !isTrashed(session)) {
      session.bookingId = null
    }
  }
}

function fallbackUnlinkBookingBySessionId(practitionerId: string, sessionId: string) {
  const linkedBooking = BOOKINGS.find(
    booking => booking.sessionId === sessionId && booking.practitionerId === practitionerId,
  )
  if (linkedBooking) linkedBooking.sessionId = undefined
}

async function linkRuntimeBookingToSession(practitionerId: string, session: Session, options: { applyInProgress?: boolean } = {}) {
  const linkedBooking = session.bookingId
    ? BOOKINGS.find(booking => booking.id === session.bookingId && booking.practitionerId === practitionerId)
    : undefined
  if (!linkedBooking) return

  linkedBooking.sessionId = session.id
  if (options.applyInProgress && linkedBooking.status === 'confirmed') {
    Object.assign(linkedBooking, applyBookingStatus(linkedBooking, 'in-progress'))
  }
  await bookingsRepository.syncRuntimeBookingToDatabase(practitionerId, linkedBooking.id, linkedBooking)
}

async function unlinkPreviousRuntimeBooking(practitionerId: string, session: Session) {
  const linkedBooking = BOOKINGS.find(
    booking =>
      booking.practitionerId === practitionerId &&
      booking.sessionId === session.id &&
      booking.id !== session.bookingId,
  )
  if (!linkedBooking) return

  linkedBooking.sessionId = undefined
  await bookingsRepository.syncRuntimeBookingToDatabase(practitionerId, linkedBooking.id, linkedBooking)
}

function fallbackCreate(practitionerId: string, input: CreateSessionInput) {
  const booking = input.bookingId
    ? BOOKINGS.find(item => item.id === input.bookingId && item.practitionerId === practitionerId)
    : undefined

  const newSession: Session = {
    id: input.id ?? `S-${Date.now()}`,
    practitionerId,
    patientId: input.patientId,
    startDateTime: input.startDateTime ?? new Date().toISOString(),
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    chiefComplaint: input.chiefComplaint ?? '',
    treatmentSummary: input.treatmentSummary ?? '',
    outcome: input.outcome ?? '',
    treatmentNotes: input.treatmentNotes ?? '',
    painScore: input.painScore,
    tcmDiagnosis: input.tcmDiagnosis,
    tcmFindings: input.tcmFindings,
    pointsUsed: input.pointsUsed,
    techniques: input.techniques ?? [],
    basicVitals: input.basicVitals,
    bookingId: input.bookingId ?? null,
  }

  sessionsStore.push(newSession)

  if (input.bookingId && booking) {
    booking.sessionId = newSession.id
    if (booking.status === 'confirmed') {
      Object.assign(booking, applyBookingStatus(booking, 'in-progress'))
    }
  }

  return newSession
}

function fallbackUpdate(
  practitionerId: string,
  sessionId: string,
  input: UpdateSessionInput,
) {
  const index = sessionsStore.findIndex(
    session =>
      session.id === sessionId &&
      session.practitionerId === practitionerId &&
      !isTrashed(session),
  )
  if (index === -1) return null

  const current = sessionsStore[index]
  const updated: Session = {
    ...current,
    ...input,
    practitionerId,
  }

  sessionsStore[index] = updated
  if (input.bookingId !== undefined) {
    for (const booking of BOOKINGS) {
      if (
        booking.practitionerId === practitionerId &&
        booking.sessionId === updated.id &&
        booking.id !== updated.bookingId
      ) {
        booking.sessionId = undefined
      }
    }

    if (updated.bookingId) {
      const linkedBooking = BOOKINGS.find(
        booking => booking.id === updated.bookingId && booking.practitionerId === practitionerId,
      )
      if (linkedBooking) linkedBooking.sessionId = updated.id
    }
  }

  return updated
}

export async function listByPractitioner(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId || !shouldUseDatabase()) return fallbackListByPractitioner(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.practitionerId, dbPractitionerId), isNull(sessionsTable.deletedAt)))
      const mapped = await mapRows(rows)
      return rememberRuntimeSessions(mapped).sort(
        (a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime(),
      )
    },
    () => fallbackListByPractitioner(practitionerId),
  )
}

export async function listByPatient(practitionerId: string, patientId: string) {
  return (await listByPractitioner(practitionerId)).filter(session => session.patientId === patientId)
}

export async function getById(practitionerId: string, sessionId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId || !shouldUseDatabase()) return fallbackGetById(practitionerId, sessionId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(sessionsTable)
        .where(
          and(
            sessionIdCondition(sessionId),
            eq(sessionsTable.practitionerId, dbPractitionerId),
            isNull(sessionsTable.deletedAt),
          ),
        )
        .limit(1)
      const mapped = await mapRows(rows)
      return mapped[0] ? rememberRuntimeSession(mapped[0]) : null
    },
    () => fallbackGetById(practitionerId, sessionId),
  )
}

export async function findByBookingId(practitionerId: string, bookingId: string) {
  return (await listByPractitioner(practitionerId)).find(session => session.bookingId === bookingId) ?? null
}

export async function unlinkBooking(practitionerId: string, bookingId: string) {
  fallbackUnlinkBooking(practitionerId, bookingId)
  const sessions = sessionsStore.filter(
    session => session.bookingId === null && session.practitionerId === practitionerId,
  )
  for (const session of sessions) {
    await syncRuntimeSessionToDatabase(practitionerId, session.id)
  }
}

export async function unlinkBookingBySessionId(practitionerId: string, sessionId: string) {
  fallbackUnlinkBookingBySessionId(practitionerId, sessionId)
}

export async function create(practitionerId: string, input: CreateSessionInput) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId || !shouldUseDatabase()) return fallbackCreate(practitionerId, input)

  const publicId = input.id ?? `S-${Date.now()}`
  const fixedDatabaseId = publicSessionIdToDatabaseId[publicId as keyof typeof publicSessionIdToDatabaseId]

  return runWithFallback(
    async () => {
      const patientId = await resolveDatabasePatientId(dbPractitionerId, input.patientId)
      const serviceId = await resolveDatabaseServiceId(dbPractitionerId, input.serviceId)
      const bookingId = await resolveDatabaseBookingId(dbPractitionerId, input.bookingId)

      if (!patientId) throw new Error(`Unknown patientId: ${input.patientId}`)
      if (input.serviceId && !serviceId) throw new Error(`Unknown serviceId: ${input.serviceId}`)
      if (input.bookingId && !bookingId) throw new Error(`Unknown bookingId: ${input.bookingId}`)

      const rows = await drizzleDb
        .insert(sessionsTable)
        .values({
          ...(fixedDatabaseId ? { id: fixedDatabaseId } : {}),
          publicId,
          practitionerId: dbPractitionerId,
          patientId,
          bookingId,
          serviceId,
          serviceName: input.serviceName ?? null,
          startAt: new Date(input.startDateTime ?? new Date().toISOString()),
          chiefComplaint: input.chiefComplaint ?? '',
          treatmentSummary: input.treatmentSummary ?? null,
          outcome: input.outcome ?? null,
          treatmentNotes: input.treatmentNotes ?? null,
          painScore: input.painScore ?? null,
          tcmDiagnosis: input.tcmDiagnosis ?? null,
          tcmFindings: input.tcmFindings ?? null,
          pointsUsed: input.pointsUsed ?? null,
          techniques: input.techniques ?? [],
          basicVitals: input.basicVitals ?? null,
        })
        .returning()

      const mapped = await mapRows(rows)
      const created = rememberRuntimeSession(mapped[0])

      await linkRuntimeBookingToSession(practitionerId, created, { applyInProgress: true })

      return created
    },
    () => fallbackCreate(practitionerId, input),
  )
}

export async function update(
  practitionerId: string,
  sessionId: string,
  input: UpdateSessionInput,
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId || !shouldUseDatabase()) return fallbackUpdate(practitionerId, sessionId, input)

  const current = await getById(practitionerId, sessionId)
  if (!current) return null

  const next: Session = {
    ...current,
    ...input,
    practitionerId,
  }

  return runWithFallback(
    async () => {
      const patientId = await resolveDatabasePatientId(dbPractitionerId, next.patientId)
      const serviceId = await resolveDatabaseServiceId(dbPractitionerId, next.serviceId)
      const bookingId = await resolveDatabaseBookingId(dbPractitionerId, next.bookingId)

      if (!patientId) throw new Error(`Unknown patientId: ${next.patientId}`)
      if (next.serviceId && !serviceId) throw new Error(`Unknown serviceId: ${next.serviceId}`)
      if (next.bookingId && !bookingId) throw new Error(`Unknown bookingId: ${next.bookingId}`)

      const rows = await drizzleDb
        .update(sessionsTable)
        .set({
          patientId,
          bookingId,
          serviceId,
          serviceName: next.serviceName ?? null,
          startAt: new Date(next.startDateTime),
          chiefComplaint: next.chiefComplaint,
          treatmentSummary: next.treatmentSummary ?? null,
          outcome: next.outcome ?? null,
          treatmentNotes: next.treatmentNotes ?? null,
          painScore: next.painScore ?? null,
          tcmDiagnosis: next.tcmDiagnosis ?? null,
          tcmFindings: next.tcmFindings ?? null,
          pointsUsed: next.pointsUsed ?? null,
          techniques: next.techniques ?? null,
          basicVitals: next.basicVitals ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            sessionIdCondition(sessionId),
            eq(sessionsTable.practitionerId, dbPractitionerId),
            isNull(sessionsTable.deletedAt),
          ),
        )
        .returning()

      const mapped = await mapRows(rows)
      if (!mapped[0]) return null
      const updated = rememberRuntimeSession(mapped[0])
      await unlinkPreviousRuntimeBooking(practitionerId, updated)
      await linkRuntimeBookingToSession(practitionerId, updated)
      return updated
    },
    () => fallbackUpdate(practitionerId, sessionId, input),
  )
}

export async function moveToTrash(practitionerId: string, sessionId: string) {
  if (!(await getById(practitionerId, sessionId))) return null
  const result = moveSessionToTrash(sessionId, practitionerId)
  await syncRuntimeSessionToDatabase(practitionerId, sessionId)
  return result
}

export async function syncRuntimeSessionToDatabase(practitionerId: string, sessionId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return

  const runtimeSession = sessionsStore.find(
    session => session.id === sessionId && session.practitionerId === practitionerId,
  )
  if (!runtimeSession) return
  if (!shouldUseDatabase()) {
    rememberRuntimeSession(runtimeSession)
    return
  }

  await runWithFallback(
    async () => {
      const patientId = await resolveDatabasePatientId(dbPractitionerId, runtimeSession.patientId)
      const serviceId = await resolveDatabaseServiceId(dbPractitionerId, runtimeSession.serviceId)
      const bookingId = await resolveDatabaseBookingId(dbPractitionerId, runtimeSession.bookingId)

      if (!patientId) throw new Error(`Unknown patientId: ${runtimeSession.patientId}`)

      await drizzleDb
        .update(sessionsTable)
        .set({
          publicId: runtimeSession.id,
          practitionerId: dbPractitionerId,
          patientId,
          bookingId,
          serviceId,
          serviceName: runtimeSession.serviceName ?? null,
          startAt: new Date(runtimeSession.startDateTime),
          chiefComplaint: runtimeSession.chiefComplaint,
          treatmentSummary: runtimeSession.treatmentSummary ?? null,
          outcome: runtimeSession.outcome ?? null,
          treatmentNotes: runtimeSession.treatmentNotes ?? null,
          painScore: runtimeSession.painScore ?? null,
          tcmDiagnosis: runtimeSession.tcmDiagnosis ?? null,
          tcmFindings: runtimeSession.tcmFindings ?? null,
          pointsUsed: runtimeSession.pointsUsed ?? null,
          techniques: runtimeSession.techniques ?? null,
          basicVitals: runtimeSession.basicVitals ?? null,
          deletedAt: dateOrNull(runtimeSession.trashMetadata?.deletedAt),
          restoreUntil: dateOrNull(runtimeSession.trashMetadata?.restoreUntil),
          deletedByPractitionerId: runtimeSession.trashMetadata?.deletedByPractitionerId
            ? databasePractitionerId(runtimeSession.trashMetadata.deletedByPractitionerId) ?? null
            : null,
          deletionGroupId: null,
          deletionType: runtimeSession.trashMetadata?.deletionType ?? null,
          deletionReason: runtimeSession.trashMetadata?.deletionReason ?? null,
          updatedAt: new Date(),
        })
        .where(and(sessionIdCondition(sessionId), eq(sessionsTable.practitionerId, dbPractitionerId)))
    },
    () => undefined,
  )
}
