// src/app/api/bookings/[bookingId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'
import type { Booking, BookingStatus } from '@/models/booking'

type UpdateBookingBody = {
  start?: string
  end?: string
  service?: string
  resource?: string | null
  notes?: string | null
  status?: BookingStatus
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await context.params

  const booking = BOOKINGS.find(b => b.id === bookingId)

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<UpdateBookingBody>

  if (body.start) {
    const start = new Date(body.start)
    if (isNaN(start.getTime())) {
      return NextResponse.json(
        { error: 'Invalid start datetime' },
        { status: 400 },
      )
    }
    booking.start = start.toISOString()
  }

  if (body.end) {
    const end = new Date(body.end)
    if (isNaN(end.getTime())) {
      return NextResponse.json(
        { error: 'Invalid end datetime' },
        { status: 400 },
      )
    }
    booking.end = end.toISOString()
  }

  if (body.service !== undefined) {
    booking.service = body.service.trim()
  }

  if (body.resource !== undefined) {
    const v = body.resource?.trim()
    booking.resource = v || undefined
  }

  if (body.notes !== undefined) {
    const v = body.notes?.trim()
    booking.notes = v || undefined
  }

  if (body.status) {
    booking.status = body.status
  }

  return NextResponse.json(booking, { status: 200 })
}

