// src/app/api/patients/[patientId]/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'
import type { Booking } from '@/models/booking'

type CreateBookingBody = {
  start: string
  end: string
  service: string
  resource?: string
  notes?: string
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  const { patientId } = await context.params

  if (!patientId) {
    return NextResponse.json(
      { error: 'Missing patientId in URL' },
      { status: 400 },
    )
  }

  const body = (await req.json()) as Partial<CreateBookingBody>

  if (!body.start || !body.end || !body.service) {
    return NextResponse.json(
      { error: 'start, end and service are required' },
      { status: 400 },
    )
  }

  const start = new Date(body.start)
  const end = new Date(body.end)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Invalid start or end datetime' },
      { status: 400 },
    )
  }

  if (end <= start) {
    return NextResponse.json(
      { error: 'End time must be after start time' },
      { status: 400 },
    )
  }

  const id = crypto.randomUUID()
  const code = `BKG-${start.getFullYear()}${String(
    start.getMonth() + 1,
  ).padStart(2, '0')}${String(start.getDate()).padStart(2, '0')}-${id.slice(
    0,
    4,
  )}`

  const newBooking: Booking = {
    id,
    code,
    patientId,
    service: body.service.trim(),
    resource: body.resource?.trim() || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'confirmed',
    notes: body.notes?.trim() || undefined,
  }

  BOOKINGS.push(newBooking)

  return NextResponse.json(newBooking, { status: 201 })
}

