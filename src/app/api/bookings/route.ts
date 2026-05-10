import { NextRequest, NextResponse } from 'next/server'

import type { Booking } from '@/models/booking'
import {
  authScopeErrorResponse,
  getPractitionerIdFromRequest,
} from '@/lib/practitionerRequest'
import { syncGoogleOnBookingCreate } from '@/lib/google/sync'
import { canUsePatientInActiveWorkflow } from '@/lib/patientWorkflow'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'

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
  let practitionerId: string
  try {
    practitionerId = await getPractitionerIdFromRequest(req)
  } catch (error) {
    const response = authScopeErrorResponse(error)
    if (response) return response
    throw error
  }

  return NextResponse.json(await bookingsRepository.listByPractitioner(practitionerId), { status: 200 })
}

export async function POST(req: NextRequest) {
  let practitionerId: string
  try {
    practitionerId = await getPractitionerIdFromRequest(req)
  } catch (error) {
    const response = authScopeErrorResponse(error)
    if (response) return response
    throw error
  }

  const body = (await req.json()) as CreateBookingBody

  const patientId = body.patientId?.trim()
  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required' }, { status: 400 })
  }

  const patient = await patientsRepository.getById(practitionerId, patientId)
  if (!patient) {
    return NextResponse.json({ error: 'Unknown patientId' }, { status: 400 })
  }

  if (!canUsePatientInActiveWorkflow(patient)) {
    return NextResponse.json(
      { error: 'Archived patients cannot be used for new bookings. Reactivate the patient first.' },
      { status: 400 },
    )
  }

  const serviceId = body.serviceId?.trim()
  if (!serviceId) {
    return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
  }

  const service = await servicesRepository.getById(practitionerId, serviceId)
  if (!service) {
    return NextResponse.json({ error: 'Unknown serviceId' }, { status: 400 })
  }

  if (!service.active) {
    return NextResponse.json(
      { error: 'Disabled services cannot be used for new bookings. Enable the service first.' },
      { status: 400 },
    )
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

  const result = await bookingsRepository.createWithOverlapCheck(practitionerId, {
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
  })

  if ('error' in result) {
    return NextResponse.json({ error: 'Booking overlaps an existing booking' }, { status: 409 })
  }

  const created = result.booking

  await syncGoogleOnBookingCreate(created, req, {
    skip: body.skipGoogleWriteback === true || Boolean(body.externalEventId),
  })
  await bookingsRepository.syncRuntimeBookingToDatabase(practitionerId, created.id, created)

  return NextResponse.json(created, { status: 201 })
}
