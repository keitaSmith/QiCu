import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ deletionGroupId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { deletionGroupId } = await params

  try {
    const result = lifecycleRepository.restoreDeletionGroup(practitionerId, deletionGroupId)
    return NextResponse.json({ ok: true, action: 'restored', ...result }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to restore records'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
