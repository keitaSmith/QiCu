import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { sessionsStore } from '@/data/sessionsStore'
import { BOOKINGS } from '@/data/bookings'
import type { Session } from '@/models/session'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ sessionId: string }>
}

const updateSessionSchema = z.object({
  startDateTime: z.string().optional(),
  serviceId: z.string().optional(),
  chiefComplaint: z.string().min(1).optional(),
  treatmentSummary: z.string().optional(),
  outcome: z.string().optional(),
  treatmentNotes: z.string().optional(),
  techniques: z.array(z.string()).optional(),
  bookingId: z.string().nullable().optional(),
})

function unlinkBookingBySessionId(sessionId: string, practitionerId: string) {
  const linkedBooking = BOOKINGS.find(
    booking => booking.sessionId === sessionId && booking.practitionerId === practitionerId,
  )
  if (linkedBooking) linkedBooking.sessionId = undefined
}

function ensureBookingCanLink(
  sessionId: string,
  patientId: string,
  bookingId: string,
  practitionerId: string,
) {
  const booking = BOOKINGS.find(item => item.id === bookingId && item.practitionerId === practitionerId)

  if (!booking) return { error: 'Booking not found', status: 404 as const }
  if (booking.patientId !== patientId) {
    return { error: 'Booking does not belong to this patient', status: 400 as const }
  }
  if (booking.status === 'cancelled' || booking.status === 'no-show') {
    return { error: `Cannot link a session to a ${booking.status} booking`, status: 400 as const }
  }
  if (booking.sessionId && booking.sessionId !== sessionId) {
    return { error: 'A different session is already linked to this booking', status: 409 as const }
  }

  return { booking }
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { sessionId } = await params
  const session = sessionsStore.find(s => s.id === sessionId && s.practitionerId === practitionerId)

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { sessionId } = await params
  const index = sessionsStore.findIndex(s => s.id === sessionId && s.practitionerId === practitionerId)
  if (index === -1) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const current = sessionsStore[index]
  const nextBookingId = parsed.data.bookingId

  if (nextBookingId !== undefined) {
    unlinkBookingBySessionId(sessionId, practitionerId)

    if (nextBookingId) {
      const result = ensureBookingCanLink(sessionId, current.patientId, nextBookingId, practitionerId)
      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      result.booking.sessionId = sessionId
    }
  }

  let nextServiceName = current.serviceName
  if (parsed.data.serviceId) {
    const service = findServiceByIdForPractitioner(parsed.data.serviceId, practitionerId)
    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }
    nextServiceName = service.name
  }

  const updated: Session = {
    ...current,
    ...parsed.data,
    practitionerId,
    serviceName: nextServiceName,
  }

  sessionsStore[index] = updated
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { sessionId } = await params
  const index = sessionsStore.findIndex(s => s.id === sessionId && s.practitionerId === practitionerId)
  if (index === -1) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  sessionsStore.splice(index, 1)
  unlinkBookingBySessionId(sessionId, practitionerId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
