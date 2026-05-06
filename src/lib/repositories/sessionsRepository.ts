import { BOOKINGS } from '@/data/bookings'
import { sessionsStore } from '@/data/sessionsStore'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { isTrashed, moveSessionToTrash } from '@/lib/dataLifecycle'
import type { Session } from '@/models/session'

export type CreateSessionInput = {
  patientId: string
  startDateTime?: string
  serviceId?: string
  serviceName?: string
  chiefComplaint?: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  techniques?: string[]
  bookingId?: string | null
}

export type UpdateSessionInput = {
  startDateTime?: string
  serviceId?: string
  serviceName?: string
  chiefComplaint?: string
  treatmentSummary?: string
  outcome?: string
  treatmentNotes?: string
  techniques?: string[]
  bookingId?: string | null
}

export function listByPractitioner(practitionerId: string) {
  return [...sessionsStore]
    .filter(session => session.practitionerId === practitionerId && !isTrashed(session))
    .sort((a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime())
}

export function listByPatient(practitionerId: string, patientId: string) {
  return sessionsStore.filter(
    session =>
      session.patientId === patientId &&
      session.practitionerId === practitionerId &&
      !isTrashed(session),
  )
}

export function getById(practitionerId: string, sessionId: string) {
  return (
    sessionsStore.find(
      session =>
        session.id === sessionId &&
        session.practitionerId === practitionerId &&
        !isTrashed(session),
    ) ?? null
  )
}

export function findByBookingId(practitionerId: string, bookingId: string) {
  return (
    sessionsStore.find(
      session =>
        session.bookingId === bookingId &&
        session.practitionerId === practitionerId &&
        !isTrashed(session),
    ) ?? null
  )
}

export function unlinkBooking(practitionerId: string, bookingId: string) {
  for (const session of sessionsStore) {
    if (session.bookingId === bookingId && session.practitionerId === practitionerId && !isTrashed(session)) {
      session.bookingId = null
    }
  }
}

export function unlinkBookingBySessionId(practitionerId: string, sessionId: string) {
  const linkedBooking = BOOKINGS.find(
    booking => booking.sessionId === sessionId && booking.practitionerId === practitionerId,
  )
  if (linkedBooking) linkedBooking.sessionId = undefined
}

export function create(practitionerId: string, input: CreateSessionInput) {
  const booking = input.bookingId
    ? BOOKINGS.find(item => item.id === input.bookingId && item.practitionerId === practitionerId)
    : undefined

  const newSession: Session = {
    id: `S-${Date.now()}`,
    practitionerId,
    patientId: input.patientId,
    startDateTime: input.startDateTime ?? new Date().toISOString(),
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    chiefComplaint: input.chiefComplaint ?? '',
    treatmentSummary: input.treatmentSummary ?? '',
    outcome: input.outcome ?? '',
    treatmentNotes: input.treatmentNotes ?? '',
    techniques: input.techniques ?? [],
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

export function update(
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
  return updated
}

export function moveToTrash(practitionerId: string, sessionId: string) {
  if (!getById(practitionerId, sessionId)) return null
  return moveSessionToTrash(sessionId, practitionerId)
}

