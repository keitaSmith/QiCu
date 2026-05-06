import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'

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

function ensureBookingCanLink(
  sessionId: string,
  patientId: string,
  bookingId: string,
  practitionerId: string,
) {
  const booking = bookingsRepository.getById(practitionerId, bookingId)

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
  const session = sessionsRepository.getById(practitionerId, sessionId)

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { sessionId } = await params
  const current = sessionsRepository.getById(practitionerId, sessionId)
  if (!current) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateSessionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const nextBookingId = parsed.data.bookingId

  if (nextBookingId !== undefined) {
    sessionsRepository.unlinkBookingBySessionId(practitionerId, sessionId)

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
    const service = servicesRepository.getById(practitionerId, parsed.data.serviceId)
    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }
    nextServiceName = service.name
  }

  const updated = sessionsRepository.update(practitionerId, sessionId, {
    ...parsed.data,
    serviceName: nextServiceName,
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { sessionId } = await params
  const session = sessionsRepository.getById(practitionerId, sessionId)
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const result = sessionsRepository.moveToTrash(practitionerId, sessionId)
  if (!result) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  return NextResponse.json(
    {
      ok: true,
      action: 'moved-to-trash',
      restoreUntil: result.restoreUntil,
      deletionGroupId: result.deletionGroupId,
    },
    { status: 200 },
  )
}
