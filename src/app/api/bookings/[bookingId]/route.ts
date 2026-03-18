import { NextRequest, NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'
import type { BookingStatus } from '@/models/booking'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type UpdateBookingBody = {
  start?: string
  end?: string
  serviceId?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { bookingId } = await context.params

  const booking = BOOKINGS.find(b => b.id === bookingId && b.practitionerId === practitionerId)

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<UpdateBookingBody>

  if (body.start) {
    const start = new Date(body.start)
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start datetime' }, { status: 400 })
    }
    booking.start = start.toISOString()
  }

  if (body.end) {
    const end = new Date(body.end)
    if (isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid end datetime' }, { status: 400 })
    }
    booking.end = end.toISOString()
  }

  if (body.serviceId !== undefined) {
    if (!body.serviceId) {
      return NextResponse.json({ error: 'serviceId cannot be empty' }, { status: 400 })
    }

    const svc = findServiceByIdForPractitioner(body.serviceId, practitionerId)
    if (!svc) {
      return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
    }

    booking.serviceId = svc.id
    booking.serviceName = svc.name
    booking.serviceDurationMinutes = svc.durationMinutes
  }

  if (body.resource !== undefined) {
    booking.resource = body.resource?.trim() || undefined
  }

  if (body.notes !== undefined) {
    booking.notes = body.notes?.trim() || undefined
  }

  if (body.status) {
    const updated = applyBookingStatus(booking, body.status)
    Object.assign(booking, updated)
  }

  return NextResponse.json(booking, { status: 200 })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { bookingId } = await context.params

  const index = BOOKINGS.findIndex(b => b.id === bookingId && b.practitionerId === practitionerId)

  if (index === -1) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  BOOKINGS.splice(index, 1)

  return NextResponse.json({ ok: true }, { status: 200 })
}
