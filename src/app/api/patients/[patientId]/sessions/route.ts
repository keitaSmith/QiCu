import { NextRequest, NextResponse } from 'next/server'
import type { Session } from '@/models/session'
import { sessionsStore } from '@/data/sessionsStore'
import { BOOKINGS } from '@/data/bookings'
import { applyBookingStatus } from '@/lib/bookingStatus'
import { findServiceById } from '@/data/servicesStore'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params
  const sessions = sessionsStore.filter(s => s.patientId === patientId)
  return NextResponse.json(sessions)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params
  const body = await req.json()

  const bookingId: string | null = body.bookingId ?? null
  const serviceId: string | undefined = body.serviceId ?? undefined
  const service = findServiceById(serviceId)

  if (serviceId && !service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  if (bookingId) {
    const booking = BOOKINGS.find(b => b.id === bookingId)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (booking.patientId !== patientId) {
      return NextResponse.json(
        { error: 'Booking does not belong to this patient' },
        { status: 400 },
      )
    }
    if (booking.status === 'cancelled' || booking.status === 'no-show') {
      return NextResponse.json(
        { error: `Cannot create a session for a ${booking.status} booking` },
        { status: 400 },
      )
    }
    if (booking.sessionId) {
      return NextResponse.json(
        { error: 'A session is already linked to this booking' },
        { status: 409 },
      )
    }
  }

  const now = new Date()
  const booking = bookingId ? BOOKINGS.find(item => item.id === bookingId) : undefined
  const resolvedService = service ?? findServiceById(booking?.serviceId)

  const newSession: Session = {
    id: `S-${Date.now()}`,
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

  if (bookingId) {
    if (booking) {
      booking.sessionId = newSession.id
      if (booking.status === 'confirmed') {
        const updated = applyBookingStatus(booking, 'in-progress')
        Object.assign(booking, updated)
      }
    }
  }

  return NextResponse.json(newSession, { status: 201 })
}
