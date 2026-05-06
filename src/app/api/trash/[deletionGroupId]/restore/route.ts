import { NextRequest, NextResponse } from 'next/server'

import { restoreDeletionGroup } from '@/lib/dataLifecycle'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ deletionGroupId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { deletionGroupId } = await params

  try {
    const result = restoreDeletionGroup(deletionGroupId, practitionerId)
    return NextResponse.json({ ok: true, action: 'restored', ...result }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to restore records'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
