// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { findServiceById } from '@/data/servicesStore'
import type { Booking } from '@/models/booking'

type CreateBookingBody = {
  patientId?: string
  serviceId?: string
  start?: string
  end?: string
  resource?: string | null
  notes?: string | null
  status?: Booking['status']
}

function generateBookingCode() {
  return `BKG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
}

// GET /api/bookings → return all bookings (in-memory)
export async function GET() {
  return NextResponse.json(BOOKINGS, { status: 200 })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBookingBody

  const patientId = body.patientId?.trim()
  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
  }

  const serviceId = body.serviceId?.trim()
  if (!serviceId) {
    return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
  }

  const service = findServiceById(serviceId)
  if (!service) {
    return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
  }

  const start = body.start ? new Date(body.start) : null
  if (!start || Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { error: 'Valid start datetime is required' },
      { status: 400 },
    )
  }

  const end = body.end ? new Date(body.end) : null
  if (!end || Number.isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Valid end datetime is required' },
      { status: 400 },
    )
  }

  if (end.getTime() <= start.getTime()) {
    return NextResponse.json(
      { error: 'end must be after start' },
      { status: 400 },
    )
  }

  const resource = body.resource?.trim() || undefined
  const notes = body.notes?.trim() || undefined

  const created: Booking = {
    id: crypto.randomUUID(),
    code: generateBookingCode(),
    patientId,
    serviceId: service.id,
    serviceName: service.name,
    serviceDurationMinutes: service.durationMinutes,
    start: start.toISOString(),
    end: end.toISOString(),
    resource,
    notes,
    status: body.status ?? 'confirmed',
  }

  BOOKINGS.unshift(created)

  return NextResponse.json(created, { status: 201 })
}
