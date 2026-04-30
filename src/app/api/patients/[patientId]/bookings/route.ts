import { NextRequest, NextResponse } from 'next/server'
import { BOOKINGS } from '@/data/bookings'
import type { Booking } from '@/models/booking'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import { getPractitionerIdFromRequest, patientBelongsToPractitioner } from '@/lib/practitioners'
import { patientsStore } from '@/data/patientsStore'
import { hasBookingOverlap } from '@/lib/bookingValidation'

type CreateBookingBody = {
  start: string
  end: string
  serviceId: string
  resource?: string
  notes?: string
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await context.params

  const patient = patientsStore.find(item => item.id === patientId)
  if (!patient || !patientBelongsToPractitioner(patient, practitionerId)) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<CreateBookingBody>

  if (!body.start || !body.end || !body.serviceId) {
    return NextResponse.json({ error: 'start, end and serviceId are required' }, { status: 400 })
  }

  const start = new Date(body.start)
  const end = new Date(body.end)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Invalid start or end datetime' }, { status: 400 })
  }

  if (end <= start) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
  }

  if (hasBookingOverlap(BOOKINGS, practitionerId, start.toISOString(), end.toISOString())) {
    return NextResponse.json({ error: 'Booking overlaps an existing booking' }, { status: 409 })
  }

  const svc = findServiceByIdForPractitioner(body.serviceId, practitionerId)
  if (!svc) {
    return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const code = `BKG-${practitionerId === 'prac-keita-smith' ? 'KEI' : 'TOM'}-${id.slice(0, 4).toUpperCase()}`

  const newBooking: Booking = {
    id,
    practitionerId,
    code,
    patientId,
    serviceId: svc.id,
    serviceName: svc.name,
    serviceDurationMinutes: svc.durationMinutes,
    resource: body.resource?.trim() || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    status: 'confirmed',
    notes: body.notes?.trim() || undefined,
  }

  BOOKINGS.push(newBooking)

  return NextResponse.json(newBooking, { status: 201 })
}
