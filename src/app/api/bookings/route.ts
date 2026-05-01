import { NextRequest, NextResponse } from 'next/server'

import { BOOKINGS } from '@/data/bookings'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import type { Booking } from '@/models/booking'
import {
  getPractitionerIdFromRequest,
  getPatientPractitionerId,
} from '@/lib/practitioners'
import { patientsStore } from '@/data/patientsStore'
import { syncGoogleOnBookingCreate } from '@/lib/google/sync'
import { hasBookingOverlap } from '@/lib/bookingValidation'

type CreateBookingBody = {
  patientId?: string
  serviceId?: string
  start?: string
  end?: string
  resource?: string | null
  notes?: string | null
  status?: Booking['status']
  externalSource?: Booking['externalSource']
  externalCalendarId?: string | null
  externalEventId?: string | null
  externalSyncStatus?: Booking['externalSyncStatus']
  skipGoogleWriteback?: boolean
}

function generateBookingCode(practitionerId: string) {
  const prefix = practitionerId === 'prac-keita-smith' ? 'KEI' : 'TOM'
  return `BKG-${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  return NextResponse.json(BOOKINGS.filter(booking => booking.practitionerId === practitionerId), { status: 200 })
}

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const body = (await req.json()) as CreateBookingBody

  const patientId = body.patientId?.trim()
  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
  }

  const patient = patientsStore.find(item => item.id === patientId)
  if (!patient || getPatientPractitionerId(patient) !== practitionerId) {
    return NextResponse.json({ error: 'Unknown patientId' }, { status: 400 })
  }

  const serviceId = body.serviceId?.trim()
  if (!serviceId) {
    return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
  }

  const service = findServiceByIdForPractitioner(serviceId, practitionerId)
  if (!service) {
    return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
  }

  const start = body.start ? new Date(body.start) : null
  if (!start || Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Valid start datetime is required' }, { status: 400 })
  }

  const end = body.end ? new Date(body.end) : null
  if (!end || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'Valid end datetime is required' }, { status: 400 })
  }

  if (end.getTime() <= start.getTime()) {
    return NextResponse.json({ error: 'end must be after start' }, { status: 400 })
  }

  const practitionerBookings = BOOKINGS.filter(booking => booking.practitionerId === practitionerId)

  if (hasBookingOverlap(practitionerBookings, start.toISOString(), end.toISOString())) {
    return NextResponse.json({ error: 'Booking overlaps an existing booking' }, { status: 409 })
  }

  const created: Booking = {
    id: crypto.randomUUID(),
    practitionerId,
    code: generateBookingCode(practitionerId),
    patientId,
    serviceId: service.id,
    serviceName: service.name,
    serviceDurationMinutes: service.durationMinutes,
    start: start.toISOString(),
    end: end.toISOString(),
    resource: body.resource?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    status: body.status ?? 'confirmed',
    externalSource: body.externalSource ?? null,
    externalCalendarId: body.externalCalendarId?.trim() || null,
    externalEventId: body.externalEventId?.trim() || null,
    externalSyncStatus: body.externalSyncStatus ?? null,
  }

  BOOKINGS.unshift(created)

  await syncGoogleOnBookingCreate(created, req, {
    skip: body.skipGoogleWriteback === true || Boolean(body.externalEventId),
  })

  return NextResponse.json(created, { status: 201 })
}
