import { NextRequest, NextResponse } from 'next/server'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import { canUsePatientInActiveWorkflow } from '@/lib/patientWorkflow'
import * as bookingsRepository from '@/lib/repositories/bookingsRepository'
import * as patientsRepository from '@/lib/repositories/patientsRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'
import * as sessionsRepository from '@/lib/repositories/sessionsRepository'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const sessions = sessionsRepository.listByPatient(practitionerId, patientId)
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const patient = patientsRepository.getById(practitionerId, patientId)
  if (!patient) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  if (!canUsePatientInActiveWorkflow(patient)) {
    return NextResponse.json(
      { error: 'Archived patients cannot be used for new sessions. Reactivate the patient first.' },
      { status: 400 },
    )
  }

  const body = await req.json()

  const bookingId: string | null = body.bookingId ?? null
  const serviceId: string | undefined = body.serviceId ?? undefined
  const service = serviceId ? await servicesRepository.getById(practitionerId, serviceId) : null

  if (serviceId && !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  if (bookingId) {
    const booking = bookingsRepository.getById(practitionerId, bookingId)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (booking.patientId !== patientId) {
      return NextResponse.json({ error: 'Booking does not belong to this patient' }, { status: 400 })
    }
    if (booking.status === 'cancelled' || booking.status === 'no-show') {
      return NextResponse.json({ error: `Cannot create a session for a ${booking.status} booking` }, { status: 400 })
    }
    if (booking.sessionId) {
      return NextResponse.json({ error: 'A session is already linked to this booking' }, { status: 409 })
    }
  }

  const now = new Date()
  const booking = bookingId
    ? bookingsRepository.getById(practitionerId, bookingId)
    : undefined
  const resolvedService = service ?? (booking?.serviceId ? await servicesRepository.getById(practitionerId, booking.serviceId) : null)

  const newSession = sessionsRepository.create(practitionerId, {
    patientId,
    startDateTime: body.startDateTime ?? now.toISOString(),
    serviceId: resolvedService?.id,
    serviceName: resolvedService?.name,
    chiefComplaint: body.chiefComplaint ?? '',
    treatmentSummary: body.treatmentSummary ?? '',
    outcome: body.outcome ?? '',
    treatmentNotes: body.treatmentNotes ?? '',
    techniques: body.techniques ?? [],
    bookingId,
  })

  return NextResponse.json(newSession, { status: 201 })
}
