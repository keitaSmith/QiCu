import { NextRequest, NextResponse } from 'next/server'
import type { Session } from '@/models/session'
import { sessionsStore } from '@/data/sessionsStore'
import { BOOKINGS } from '@/data/bookings'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { findServiceByIdForPractitioner } from '@/data/servicesStore'
import { getPractitionerIdFromRequest, patientBelongsToPractitioner } from '@/lib/practitioners'
import { patientsStore } from '@/data/patientsStore'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const sessions = sessionsStore.filter(
    session => session.patientId === patientId && session.practitionerId === practitionerId,
  )
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { patientId } = await params
  const patient = patientsStore.find(item => item.id === patientId)
  if (!patient || !patientBelongsToPractitioner(patient, practitionerId)) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  const body = await req.json()

  const bookingId: string | null = body.bookingId ?? null
  const serviceId: string | undefined = body.serviceId ?? undefined
  const service = findServiceByIdForPractitioner(serviceId, practitionerId)

  if (serviceId && !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  if (bookingId) {
    const booking = BOOKINGS.find(b => b.id === bookingId && b.practitionerId === practitionerId)
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
    ? BOOKINGS.find(item => item.id === bookingId && item.practitionerId === practitionerId)
    : undefined
  const resolvedService = service ?? findServiceByIdForPractitioner(booking?.serviceId, practitionerId)

  const newSession: Session = {
    id: `S-${Date.now()}`,
    practitionerId,
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
  }

  sessionsStore.push(newSession)

  if (bookingId && booking) {
    booking.sessionId = newSession.id
    if (booking.status === 'confirmed') {
      const updated = applyBookingStatus(booking, 'in-progress')
      Object.assign(booking, updated)
    }
  }

  return NextResponse.json(newSession, { status: 201 })
}
