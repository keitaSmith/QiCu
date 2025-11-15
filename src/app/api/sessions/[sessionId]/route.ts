import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sessionsStore } from '@/data/sessionsStore'
import type { Session } from '@/models/session'

type RouteParams = {
  params: Promise<{ sessionId: string }>
}

const updateSessionSchema = z.object({
  startDateTime: z.string().optional(),
  chiefComplaint: z.string().min(1).optional(),
  techniques: z.array(z.string()).optional(),
})

// PATCH /api/sessions/:sessionId
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params

  const index = sessionsStore.findIndex(s => s.id === sessionId)
  if (index === -1) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateSessionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const current = sessionsStore[index]

  const updated: Session = {
    ...current,
    ...parsed.data,
  }

  sessionsStore[index] = updated

  return NextResponse.json(updated)
}
