import { NextRequest, NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'
import type { BookingStatus } from '@/models/booking'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import { syncGoogleOnBookingDelete, syncGoogleOnBookingUpdate } from '@/lib/google/sync'
import { hasBookingOverlap } from '@/lib/bookingValidation'

type UpdateBookingBody = {
  start?: string
  end?: string
  serviceId?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
  skipGoogleWriteback?: boolean
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
  const nextStart = body.start ? new Date(body.start) : new Date(booking.start)
  const nextEnd = body.end ? new Date(body.end) : new Date(booking.end)

  if (body.start) {
    if (isNaN(nextStart.getTime())) {
      return NextResponse.json({ error: 'Invalid start datetime' }, { status: 400 })
    }
  }

  if (body.end) {
    if (isNaN(nextEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid end datetime' }, { status: 400 })
    }
  }

  if (nextEnd.getTime() <= nextStart.getTime()) {
    return NextResponse.json({ error: 'end must be after start' }, { status: 400 })
  }

  const practitionerBookings = BOOKINGS.filter(candidate => candidate.practitionerId === practitionerId)

  if (
    hasBookingOverlap(
      practitionerBookings,
      nextStart.toISOString(),
      nextEnd.toISOString(),
      booking.id,
    )
  ) {
    return NextResponse.json({ error: 'Booking overlaps an existing booking' }, { status: 409 })
  }

  if (body.start) {
    booking.start = nextStart.toISOString()
  }

  if (body.end) {
    booking.end = nextEnd.toISOString()
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

  await syncGoogleOnBookingUpdate(booking, req, {
    skip: body.skipGoogleWriteback === true,
  })

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

  await syncGoogleOnBookingDelete(BOOKINGS[index], req)

  BOOKINGS.splice(index, 1)

  return NextResponse.json({ ok: true }, { status: 200 })
}
