import { NextRequest, NextResponse } from 'next/server'
import type { Session } from '@/models/session'
import { sessionsStore } from '@/data/sessionsStore'
import { BOOKINGS } from '@/data/bookings'

type RouteParams = {
  params: Promise<{ patientId: string }>
}

// GET /api/patients/:patientId/sessions
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params

  const sessions = sessionsStore.filter(s => s.patientId === patientId)
  return NextResponse.json(sessions)
}

// POST /api/patients/:patientId/sessions
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { patientId } = await params
  const body = await req.json()

  // Optional: link this session to a booking
  const bookingId: string | null = body.bookingId ?? null

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

  // basic shape, adjust to your Session model
  const now = new Date()
  const newSession: Session = {
    id: `S-${Date.now()}`, // simple ID for dev
    patientId,
    startDateTime: body.startDateTime ?? now.toISOString(),
    chiefComplaint: body.chiefComplaint ?? '',
    techniques: body.techniques ?? [],
    bookingId,
  }

  sessionsStore.push(newSession)

  // If linked to booking, write back to booking state.
  if (bookingId) {
    const booking = BOOKINGS.find(b => b.id === bookingId)
    if (booking) {
      booking.sessionId = newSession.id
      // Linking a note means the visit has started unless it was already completed.
      if (booking.status === 'confirmed') booking.status = 'in-progress'
    }
  }

  return NextResponse.json(newSession, { status: 201 })
}
