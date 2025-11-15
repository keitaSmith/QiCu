import { NextRequest, NextResponse } from 'next/server'
import type { Session } from '@/models/session'
import { sessionsStore } from '@/data/sessionsStore'

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

  // basic shape, adjust to your Session model
  const now = new Date()
  const newSession: Session = {
    id: `S-${Date.now()}`, // simple ID for dev
    patientId,
    startDateTime: body.startDateTime ?? now.toISOString(),
    chiefComplaint: body.chiefComplaint ?? '',
    techniques: body.techniques ?? [],
  }

  sessionsStore.push(newSession)

  return NextResponse.json(newSession, { status: 201 })
}
