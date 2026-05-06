import { NextRequest, NextResponse } from 'next/server'
import type { BookingStatus } from '@/models/booking'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import { syncGoogleOnBookingDelete, syncGoogleOnBookingUpdate } from '@/lib/google/sync'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'

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

  const booking = bookingsRepository.getById(practitionerId, bookingId)

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

  const changesStart = body.start !== undefined && nextStart.toISOString() !== booking.start
  const changesEnd = body.end !== undefined && nextEnd.toISOString() !== booking.end
  const changesTime = changesStart || changesEnd
  const reactivatesCancelledBooking = body.status !== undefined && body.status !== 'cancelled'

  if (booking.status === 'cancelled' && changesTime && !reactivatesCancelledBooking) {
    return NextResponse.json(
      {
        error: 'Cancelled bookings cannot be rescheduled. Create a new booking or change the status first.',
      },
      { status: 400 },
    )
  }

  let serviceUpdate:
    | { serviceId: string; serviceName: string; serviceDurationMinutes: number }
    | undefined

  if (body.serviceId !== undefined) {
    if (!body.serviceId) {
      return NextResponse.json({ error: 'serviceId cannot be empty' }, { status: 400 })
    }

    const svc = servicesRepository.getById(practitionerId, body.serviceId)
    if (!svc) {
      return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
    }

    serviceUpdate = {
      serviceId: svc.id,
      serviceName: svc.name,
      serviceDurationMinutes: svc.durationMinutes,
    }
  }

  const result = bookingsRepository.updateWithOverlapCheck(practitionerId, bookingId, {
    start: body.start,
    end: body.end,
    resource: body.resource,
    notes: body.notes,
    status: body.status,
    ...serviceUpdate,
  })

  if ('error' in result) {
    if (result.error === 'overlap') {
      return NextResponse.json({ error: 'Booking overlaps an existing booking' }, { status: 409 })
    }
    if (result.error === 'cancelled-reschedule') {
      return NextResponse.json(
        {
          error: 'Cancelled bookings cannot be rescheduled. Create a new booking or change the status first.',
        },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const updatedBooking = result.booking

  await syncGoogleOnBookingUpdate(updatedBooking, req, {
    skip: body.skipGoogleWriteback === true,
  })

  return NextResponse.json(updatedBooking, { status: 200 })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { bookingId } = await context.params

  const booking = bookingsRepository.getById(practitionerId, bookingId)

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  await syncGoogleOnBookingDelete(booking, req)

  const result = bookingsRepository.moveToTrash(practitionerId, bookingId)
  if (!result) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
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
