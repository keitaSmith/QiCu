import { NextResponse } from 'next/server'
import { sessionsStore } from '@/data/sessionsStore'

// GET /api/sessions → return all sessions (in-memory)
export async function GET() {
  const sessions = [...sessionsStore].sort(
    (a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime(),
  )

  return NextResponse.json(sessions, { status: 200 })
}
