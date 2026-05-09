import { and, eq, inArray, isNull, or } from 'drizzle-orm'

import { BOOKINGS } from '@/data/bookings'
import { sessionsStore } from '@/data/sessionsStore'
import { drizzleDb } from '@/db/client'
import { bookings, patients, services, sessions as sessionsTable } from '@/db/schema'
import {
  demoBookingIds,
  demoPatientIds,
  demoPractitionerIds,
  demoServiceIds,
  demoSessionIds,
} from '@/db/seeds/ids'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { hasBookingOverlap, isBookingAvailabilityBlocking } from '@/lib/bookingValidation'
import { isTrashed, moveBookingToTrash } from '@/lib/dataLifecycle'
import type { GoogleCalendarEvent } from '@/lib/google/calendarApi'
import type { TrashMetadata } from '@/models/lifecycle'
import type { Booking, BookingStatus } from '@/models/booking'

export type CreateBookingInput = {
  patientId: string
  serviceId: string
  serviceName: string
  serviceDurationMinutes: number
  start: string
  end: string
  code: string
  id?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
  externalSource?: Booking['externalSource']
  externalCalendarId?: string | null
  externalEventId?: string | null
  externalSyncStatus?: Booking['externalSyncStatus']
}

export type UpdateBookingInput = {
  start?: string
  end?: string
  serviceId?: string
  serviceName?: string
  serviceDurationMinutes?: number
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
}

type CreateOptions = {
  insert?: 'start' | 'end'
}

type BookingRow = typeof bookings.$inferSelect
type BookingMaps = {
  patientPublicIds: Map<string, string>
  servicePublicIds: Map<string, string>
  sessionPublicIdsByBookingId: Map<string, string>
}

const publicPractitionerIdToDatabaseId = demoPractitionerIds
const publicBookingIdToDatabaseId = demoBookingIds
const publicPatientIdToDatabaseId = demoPatientIds
const publicServiceIdToDatabaseId = demoServiceIds

const databasePractitionerIdToPublicId = reverse(publicPractitionerIdToDatabaseId)
const databaseBookingIdToPublicId = reverse(publicBookingIdToDatabaseId)
const databasePatientIdToPublicId = reverse(publicPatientIdToDatabaseId)
const databaseServiceIdToPublicId = reverse(publicServiceIdToDatabaseId)
const databaseSessionIdToPublicId = reverse(demoSessionIds)

function reverse<T extends Record<string, string>>(value: T) {
  return Object.fromEntries(Object.entries(value).map(([publicId, databaseId]) => [databaseId, publicId])) as Record<
    string,
    string
  >
}

function databasePractitionerId(practitionerId: string) {
  return publicPractitionerIdToDatabaseId[
    practitionerId as keyof typeof publicPractitionerIdToDatabaseId
  ]
}

function databaseBookingId(bookingId: string) {
  return publicBookingIdToDatabaseId[bookingId as keyof typeof publicBookingIdToDatabaseId] ?? bookingId
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
}

function bookingIdCondition(bookingId: string) {
  const dbBookingId = databaseBookingId(bookingId)
  if (dbBookingId !== bookingId || isUuid(bookingId)) {
    return or(eq(bookings.id, dbBookingId), eq(bookings.publicId, bookingId))
  }
  return eq(bookings.publicId, bookingId)
}

function publicPractitionerIdForRow(row: BookingRow) {
  return databasePractitionerIdToPublicId[row.practitionerId] ?? row.practitionerId
}

function publicBookingIdForRow(row: BookingRow) {
  return row.publicId ?? databaseBookingIdToPublicId[row.id] ?? row.id
}

function dateOrNull(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isoOrUndefined(value?: Date | null) {
  return value ? value.toISOString() : undefined
}

function publicSessionIdForBooking(practitionerId: string, bookingId: string) {
  const linkedSession = sessionsStore.find(
    session =>
      session.practitionerId === practitionerId &&
      session.bookingId === bookingId &&
      !isTrashed(session),
  )
  if (linkedSession) return linkedSession.id

  return BOOKINGS.find(
    booking => booking.id === bookingId && booking.practitionerId === practitionerId && !isTrashed(booking),
  )?.sessionId
}

function trashMetadataForRow(row: BookingRow, practitionerId: string): Booking['trashMetadata'] {
  if (!row.deletedAt || !row.restoreUntil) return undefined

  return {
    deletedAt: row.deletedAt.toISOString(),
    restoreUntil: row.restoreUntil.toISOString(),
    deletedByPractitionerId:
      (row.deletedByPractitionerId && databasePractitionerIdToPublicId[row.deletedByPractitionerId]) ??
      practitionerId,
    deletionGroupId: row.deletionGroupId ?? `db-booking-trash-${row.id}`,
    deletionType: (row.deletionType as TrashMetadata['deletionType'] | null) ?? 'booking',
    deletionReason: row.deletionReason ?? undefined,
  }
}

function toPublicBooking(row: BookingRow, maps: BookingMaps): Booking {
  const practitionerId = publicPractitionerIdForRow(row)
  const publicId = publicBookingIdForRow(row)

  return {
    id: publicId,
    code: row.code,
    practitionerId,
    patientId:
      maps.patientPublicIds.get(row.patientId) ??
      databasePatientIdToPublicId[row.patientId] ??
      row.patientId,
    serviceId: row.serviceId
      ? maps.servicePublicIds.get(row.serviceId) ??
        databaseServiceIdToPublicId[row.serviceId] ??
        row.serviceId
      : '',
    serviceName: row.serviceName,
    serviceDurationMinutes: row.serviceDurationMinutes,
    resource: row.resource ?? undefined,
    start: row.startAt.toISOString(),
    end: row.endAt.toISOString(),
    status: row.status as BookingStatus,
    statusUpdatedAt: isoOrUndefined(row.statusUpdatedAt),
    notes: row.notes ?? undefined,
    externalSource: (row.externalSource as Booking['externalSource']) ?? null,
    externalCalendarId: row.externalCalendarId ?? null,
    externalEventId: row.externalEventId ?? null,
    externalSyncStatus: (row.externalSyncStatus as Booking['externalSyncStatus']) ?? null,
    externalLastSyncedAt: isoOrUndefined(row.externalLastSyncedAt),
    sessionId: maps.sessionPublicIdsByBookingId.get(row.id) ?? publicSessionIdForBooking(practitionerId, publicId),
    trashMetadata: trashMetadataForRow(row, practitionerId),
  }
}

function rememberRuntimeBooking(booking: Booking) {
  const index = BOOKINGS.findIndex(
    item => item.id === booking.id && item.practitionerId === booking.practitionerId,
  )

  if (index === -1) {
    BOOKINGS.unshift(booking)
  } else if (!isTrashed(BOOKINGS[index]) || booking.trashMetadata) {
    BOOKINGS[index] = {
      ...BOOKINGS[index],
      ...booking,
    }
  }

  return booking
}

function rememberRuntimeBookings(bookingList: Booking[]) {
  for (const booking of bookingList) rememberRuntimeBooking(booking)
  return bookingList
}

async function runWithFallback<T>(query: () => Promise<T>, fallback: () => T) {
  try {
    return await query()
  } catch (error) {
    if (process.env.NODE_ENV === 'production') throw error
    return fallback()
  }
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    Boolean(process.env.NODE_TEST_CONTEXT)
}

function shouldUseDatabase() {
  return !isTestRuntime()
}

async function loadPublicIdMaps(rows: BookingRow[]): Promise<BookingMaps> {
  const patientIds = [...new Set(rows.map(row => row.patientId))]
  const serviceIds = [...new Set(rows.map(row => row.serviceId).filter((id): id is string => Boolean(id)))]
  const patientPublicIds = new Map<string, string>()
  const servicePublicIds = new Map<string, string>()
  const sessionPublicIdsByBookingId = new Map<string, string>()

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

  const bookingIds = rows.map(row => row.id)
  if (bookingIds.length > 0) {
    const sessionRows = await drizzleDb
      .select({
        id: sessionsTable.id,
        publicId: sessionsTable.publicId,
        bookingId: sessionsTable.bookingId,
      })
      .from(sessionsTable)
      .where(and(inArray(sessionsTable.bookingId, bookingIds), isNull(sessionsTable.deletedAt)))

    for (const session of sessionRows) {
      if (!session.bookingId || sessionPublicIdsByBookingId.has(session.bookingId)) continue
      sessionPublicIdsByBookingId.set(
        session.bookingId,
        session.publicId ?? databaseSessionIdToPublicId[session.id] ?? session.id,
      )
    }
  }

  return { patientPublicIds, servicePublicIds, sessionPublicIdsByBookingId }
}

async function mapRows(rows: BookingRow[]) {
  const maps = await loadPublicIdMaps(rows)
  return rows.map(row => toPublicBooking(row, maps))
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

async function resolveDatabaseServiceId(dbPractitionerId: string, serviceId: string) {
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

function fallbackListByPractitioner(practitionerId: string) {
  return BOOKINGS.filter(booking => booking.practitionerId === practitionerId && !isTrashed(booking))
}

function fallbackListGoogleImportPreviewBookings(practitionerId: string) {
  return BOOKINGS.filter(booking => booking.practitionerId === practitionerId)
}

function fallbackGetById(practitionerId: string, bookingId: string) {
  return (
    BOOKINGS.find(
      booking =>
        booking.id === bookingId &&
        booking.practitionerId === practitionerId &&
        !isTrashed(booking),
    ) ?? null
  )
}

function fallbackHasOverlapForPractitioner(
  practitionerId: string,
  start: string,
  end: string,
  excludeBookingId?: string,
) {
  return hasBookingOverlap(fallbackListByPractitioner(practitionerId), start, end, excludeBookingId)
}

function fallbackCreateWithOverlapCheck(
  practitionerId: string,
  input: CreateBookingInput,
  options: CreateOptions = {},
) {
  if (fallbackHasOverlapForPractitioner(practitionerId, input.start, input.end)) {
    return { error: 'overlap' as const }
  }

  const created: Booking = {
    id: input.id ?? crypto.randomUUID(),
    practitionerId,
    code: input.code,
    patientId: input.patientId,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    serviceDurationMinutes: input.serviceDurationMinutes,
    start: input.start,
    end: input.end,
    resource: input.resource?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    status: input.status ?? 'confirmed',
    externalSource: input.externalSource ?? null,
    externalCalendarId: input.externalCalendarId?.trim() || null,
    externalEventId: input.externalEventId?.trim() || null,
    externalSyncStatus: input.externalSyncStatus ?? null,
  }

  if (options.insert === 'end') {
    BOOKINGS.push(created)
  } else {
    BOOKINGS.unshift(created)
  }

  return { booking: created }
}

function fallbackUpdateWithOverlapCheck(
  practitionerId: string,
  bookingId: string,
  input: UpdateBookingInput,
) {
  const booking = fallbackGetById(practitionerId, bookingId)
  if (!booking) return { error: 'not-found' as const }

  const nextStart = input.start ? new Date(input.start) : new Date(booking.start)
  const nextEnd = input.end ? new Date(input.end) : new Date(booking.end)
  const changesStart = input.start !== undefined && nextStart.toISOString() !== booking.start
  const changesEnd = input.end !== undefined && nextEnd.toISOString() !== booking.end
  const changesTime = changesStart || changesEnd
  const reactivatesCancelledBooking = input.status !== undefined && input.status !== 'cancelled'

  if (booking.status === 'cancelled' && changesTime && !reactivatesCancelledBooking) {
    return { error: 'cancelled-reschedule' as const }
  }

  if (fallbackHasOverlapForPractitioner(practitionerId, nextStart.toISOString(), nextEnd.toISOString(), booking.id)) {
    return { error: 'overlap' as const }
  }

  if (input.start) booking.start = nextStart.toISOString()
  if (input.end) booking.end = nextEnd.toISOString()

  if (input.serviceId !== undefined) booking.serviceId = input.serviceId
  if (input.serviceName !== undefined) booking.serviceName = input.serviceName
  if (input.serviceDurationMinutes !== undefined) booking.serviceDurationMinutes = input.serviceDurationMinutes
  if (input.resource !== undefined) booking.resource = input.resource?.trim() || undefined
  if (input.notes !== undefined) booking.notes = input.notes?.trim() || undefined
  if (input.status) Object.assign(booking, applyBookingStatus(booking, input.status))

  return { booking }
}

function fallbackReconcileGoogleLinkedBooking(
  practitionerId: string,
  bookingId: string,
  event: GoogleCalendarEvent | null,
  options: { now?: Date } = {},
) {
  const booking = BOOKINGS.find(
    item =>
      item.id === bookingId &&
      item.practitionerId === practitionerId &&
      item.externalSource === 'google' &&
      item.externalCalendarId &&
      item.externalEventId,
  )
  if (!booking) return 'skipped' as const

  return reconcileBookingObject(booking, event, options)
}

function reconcileBookingObject(
  booking: Booking,
  event: GoogleCalendarEvent | null,
  options: { now?: Date } = {},
) {
  const now = (options.now ?? new Date()).toISOString()

  if (!event || event.status === 'cancelled') {
    if (booking.status !== 'cancelled') {
      booking.status = 'cancelled'
      booking.statusUpdatedAt = now
      booking.externalSyncStatus = 'synced'
      booking.externalLastSyncedAt = now
      return 'cancelled' as const
    }

    return 'unchanged' as const
  }

  let changed = false
  const start = event.start?.dateTime ? new Date(event.start.dateTime).toISOString() : booking.start
  const end = event.end?.dateTime ? new Date(event.end.dateTime).toISOString() : booking.end
  const location = (event.location ?? '').trim() || undefined

  if (start && booking.start !== start) {
    booking.start = start
    changed = true
  }
  if (end && booking.end !== end) {
    booking.end = end
    changed = true
  }
  if ((booking.resource ?? '') !== (location ?? '')) {
    booking.resource = location
    changed = true
  }

  booking.externalSyncStatus = 'synced'
  booking.externalLastSyncedAt = now

  return changed ? ('updated' as const) : ('unchanged' as const)
}

export async function listByPractitioner(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListByPractitioner(practitionerId)
  if (!shouldUseDatabase()) return fallbackListByPractitioner(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(bookings)
        .where(and(eq(bookings.practitionerId, dbPractitionerId), isNull(bookings.deletedAt)))
      return rememberRuntimeBookings(await mapRows(rows))
    },
    () => fallbackListByPractitioner(practitionerId),
  )
}

export async function listByPatient(practitionerId: string, patientId: string) {
  return (await listByPractitioner(practitionerId)).filter(booking => booking.patientId === patientId)
}

export async function listGoogleImportPreviewBookings(practitionerId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackListGoogleImportPreviewBookings(practitionerId)
  if (!shouldUseDatabase()) return fallbackListGoogleImportPreviewBookings(practitionerId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(bookings)
        .where(eq(bookings.practitionerId, dbPractitionerId))
      return rememberRuntimeBookings(await mapRows(rows))
    },
    () => fallbackListGoogleImportPreviewBookings(practitionerId),
  )
}

export async function listGoogleLinkedBookingsForReconcile(practitionerId: string) {
  return (await listGoogleImportPreviewBookings(practitionerId)).filter(
    booking =>
      booking.externalSource === 'google' &&
      Boolean(booking.externalCalendarId) &&
      Boolean(booking.externalEventId),
  )
}

export async function getById(practitionerId: string, bookingId: string) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackGetById(practitionerId, bookingId)
  if (!shouldUseDatabase()) return fallbackGetById(practitionerId, bookingId)

  return runWithFallback(
    async () => {
      const rows = await drizzleDb
        .select()
        .from(bookings)
        .where(
          and(
            bookingIdCondition(bookingId),
            eq(bookings.practitionerId, dbPractitionerId),
            isNull(bookings.deletedAt),
          ),
        )
        .limit(1)
      const mapped = await mapRows(rows)
      return mapped[0] ? rememberRuntimeBooking(mapped[0]) : null
    },
    () => fallbackGetById(practitionerId, bookingId),
  )
}

export async function findAvailabilityBlockingBookings(
  practitionerId: string,
  range?: { start?: string; end?: string },
) {
  const bookingsForPractitioner = await listByPractitioner(practitionerId)
  return bookingsForPractitioner.filter(booking => {
    if (!isBookingAvailabilityBlocking(booking, practitionerId)) return false
    if (!range?.start && !range?.end) return true

    const bookingStart = new Date(booking.start).getTime()
    const bookingEnd = new Date(booking.end).getTime()
    const rangeStart = range.start ? new Date(range.start).getTime() : Number.NEGATIVE_INFINITY
    const rangeEnd = range.end ? new Date(range.end).getTime() : Number.POSITIVE_INFINITY

    return bookingStart < rangeEnd && bookingEnd > rangeStart
  })
}

export async function hasOverlapForPractitioner(
  practitionerId: string,
  start: string,
  end: string,
  excludeBookingId?: string,
) {
  return hasBookingOverlap(await listByPractitioner(practitionerId), start, end, excludeBookingId)
}

export async function createWithOverlapCheck(
  practitionerId: string,
  input: CreateBookingInput,
  options: CreateOptions = {},
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackCreateWithOverlapCheck(practitionerId, input, options)
  if (!shouldUseDatabase()) {
    return fallbackCreateWithOverlapCheck(practitionerId, input, options)
  }

  if (await hasOverlapForPractitioner(practitionerId, input.start, input.end)) {
    return { error: 'overlap' as const }
  }

  const publicId = input.id ?? crypto.randomUUID()
  const fixedDatabaseId = publicBookingIdToDatabaseId[publicId as keyof typeof publicBookingIdToDatabaseId]

  return runWithFallback<{ booking: Booking } | { error: 'overlap' }>(
    async () => {
      const patientId = await resolveDatabasePatientId(dbPractitionerId, input.patientId)
      const serviceId = await resolveDatabaseServiceId(dbPractitionerId, input.serviceId)

      if (!patientId) throw new Error(`Unknown patientId: ${input.patientId}`)
      if (!serviceId) throw new Error(`Unknown serviceId: ${input.serviceId}`)

      const rows = await drizzleDb
        .insert(bookings)
        .values({
          ...(fixedDatabaseId ? { id: fixedDatabaseId } : {}),
          publicId,
          practitionerId: dbPractitionerId,
          patientId,
          serviceId,
          code: input.code,
          serviceName: input.serviceName,
          serviceDurationMinutes: input.serviceDurationMinutes,
          resource: input.resource?.trim() || null,
          startAt: new Date(input.start),
          endAt: new Date(input.end),
          status: input.status ?? 'confirmed',
          notes: input.notes?.trim() || null,
          externalSource: input.externalSource ?? null,
          externalCalendarId: input.externalCalendarId?.trim() || null,
          externalEventId: input.externalEventId?.trim() || null,
          externalSyncStatus: input.externalSyncStatus ?? null,
        })
        .returning()

      const mapped = await mapRows(rows)
      if (!mapped[0]) throw new Error('Booking insert did not return a row')
      return { booking: rememberRuntimeBooking(mapped[0]) }
    },
    () => fallbackCreateWithOverlapCheck(practitionerId, input, options),
  )
}

export async function updateWithOverlapCheck(
  practitionerId: string,
  bookingId: string,
  input: UpdateBookingInput,
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return fallbackUpdateWithOverlapCheck(practitionerId, bookingId, input)
  if (!shouldUseDatabase()) {
    return fallbackUpdateWithOverlapCheck(practitionerId, bookingId, input)
  }

  const booking = await getById(practitionerId, bookingId)
  if (!booking) return { error: 'not-found' as const }

  const nextStart = input.start ? new Date(input.start) : new Date(booking.start)
  const nextEnd = input.end ? new Date(input.end) : new Date(booking.end)
  const changesStart = input.start !== undefined && nextStart.toISOString() !== booking.start
  const changesEnd = input.end !== undefined && nextEnd.toISOString() !== booking.end
  const changesTime = changesStart || changesEnd
  const reactivatesCancelledBooking = input.status !== undefined && input.status !== 'cancelled'

  if (booking.status === 'cancelled' && changesTime && !reactivatesCancelledBooking) {
    return { error: 'cancelled-reschedule' as const }
  }

  if (await hasOverlapForPractitioner(practitionerId, nextStart.toISOString(), nextEnd.toISOString(), booking.id)) {
    return { error: 'overlap' as const }
  }

  const nextBooking: Booking = { ...booking }

  if (input.start) nextBooking.start = nextStart.toISOString()
  if (input.end) nextBooking.end = nextEnd.toISOString()
  if (input.serviceId !== undefined) nextBooking.serviceId = input.serviceId
  if (input.serviceName !== undefined) nextBooking.serviceName = input.serviceName
  if (input.serviceDurationMinutes !== undefined) nextBooking.serviceDurationMinutes = input.serviceDurationMinutes
  if (input.resource !== undefined) nextBooking.resource = input.resource?.trim() || undefined
  if (input.notes !== undefined) nextBooking.notes = input.notes?.trim() || undefined
  if (input.status) Object.assign(nextBooking, applyBookingStatus(nextBooking, input.status))

  return runWithFallback(
    async () => {
      const serviceId = await resolveDatabaseServiceId(dbPractitionerId, nextBooking.serviceId)
      if (!serviceId) throw new Error(`Unknown serviceId: ${nextBooking.serviceId}`)

      const rows = await drizzleDb
        .update(bookings)
        .set({
          serviceId,
          serviceName: nextBooking.serviceName,
          serviceDurationMinutes: nextBooking.serviceDurationMinutes,
          resource: nextBooking.resource ?? null,
          startAt: new Date(nextBooking.start),
          endAt: new Date(nextBooking.end),
          status: nextBooking.status,
          statusUpdatedAt: dateOrNull(nextBooking.statusUpdatedAt),
          notes: nextBooking.notes ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            bookingIdCondition(bookingId),
            eq(bookings.practitionerId, dbPractitionerId),
            isNull(bookings.deletedAt),
          ),
        )
        .returning()

      const mapped = await mapRows(rows)
      return mapped[0] ? { booking: rememberRuntimeBooking(mapped[0]) } : { error: 'not-found' as const }
    },
    () => fallbackUpdateWithOverlapCheck(practitionerId, bookingId, input),
  )
}

export async function moveToTrash(practitionerId: string, bookingId: string) {
  if (!(await getById(practitionerId, bookingId))) return null
  const result = moveBookingToTrash(bookingId, practitionerId)
  await syncRuntimeBookingToDatabase(practitionerId, bookingId)
  return result
}

export async function reconcileGoogleLinkedBooking(
  practitionerId: string,
  bookingId: string,
  event: GoogleCalendarEvent | null,
  options: { now?: Date } = {},
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) {
    return fallbackReconcileGoogleLinkedBooking(practitionerId, bookingId, event, options)
  }
  if (!shouldUseDatabase()) {
    return fallbackReconcileGoogleLinkedBooking(practitionerId, bookingId, event, options)
  }

  return runWithFallback(
    async () => {
      const linkedBookings = await listGoogleLinkedBookingsForReconcile(practitionerId)
      const booking = linkedBookings.find(item => item.id === bookingId)
      if (!booking) return 'skipped' as const

      const result = reconcileBookingObject(booking, event, options)
      rememberRuntimeBooking(booking)
      await syncRuntimeBookingToDatabase(practitionerId, booking.id, booking)
      return result
    },
    () => fallbackReconcileGoogleLinkedBooking(practitionerId, bookingId, event, options),
  )
}

export async function syncRuntimeBookingToDatabase(
  practitionerId: string,
  bookingId: string,
  bookingOverride?: Booking,
) {
  const dbPractitionerId = databasePractitionerId(practitionerId)
  if (!dbPractitionerId) return

  const runtimeBooking =
    bookingOverride ??
    BOOKINGS.find(booking => booking.id === bookingId && booking.practitionerId === practitionerId)
  if (!runtimeBooking) return
  if (!shouldUseDatabase()) {
    rememberRuntimeBooking(runtimeBooking)
    return
  }

  await runWithFallback(
    async () => {
      const patientId = await resolveDatabasePatientId(dbPractitionerId, runtimeBooking.patientId)
      const serviceId = runtimeBooking.serviceId
        ? await resolveDatabaseServiceId(dbPractitionerId, runtimeBooking.serviceId)
        : null

      if (!patientId) throw new Error(`Unknown patientId: ${runtimeBooking.patientId}`)

      rememberRuntimeBooking(runtimeBooking)

      await drizzleDb
        .update(bookings)
        .set({
          publicId: runtimeBooking.id,
          practitionerId: dbPractitionerId,
          patientId,
          serviceId,
          code: runtimeBooking.code,
          serviceName: runtimeBooking.serviceName,
          serviceDurationMinutes: runtimeBooking.serviceDurationMinutes,
          resource: runtimeBooking.resource ?? null,
          startAt: new Date(runtimeBooking.start),
          endAt: new Date(runtimeBooking.end),
          status: runtimeBooking.status,
          statusUpdatedAt: dateOrNull(runtimeBooking.statusUpdatedAt),
          notes: runtimeBooking.notes ?? null,
          externalSource: runtimeBooking.externalSource ?? null,
          externalCalendarId: runtimeBooking.externalCalendarId ?? null,
          externalEventId: runtimeBooking.externalEventId ?? null,
          externalSyncStatus: runtimeBooking.externalSyncStatus ?? null,
          externalLastSyncedAt: dateOrNull(runtimeBooking.externalLastSyncedAt),
          deletedAt: dateOrNull(runtimeBooking.trashMetadata?.deletedAt),
          restoreUntil: dateOrNull(runtimeBooking.trashMetadata?.restoreUntil),
          deletedByPractitionerId: runtimeBooking.trashMetadata?.deletedByPractitionerId
            ? databasePractitionerId(runtimeBooking.trashMetadata.deletedByPractitionerId) ?? null
            : null,
          deletionGroupId: null,
          deletionType: runtimeBooking.trashMetadata?.deletionType ?? null,
          deletionReason: runtimeBooking.trashMetadata?.deletionReason ?? null,
          updatedAt: new Date(),
        })
        .where(and(bookingIdCondition(bookingId), eq(bookings.practitionerId, dbPractitionerId)))
    },
    () => undefined,
  )
}
