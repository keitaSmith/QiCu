import { NextRequest, NextResponse } from 'next/server'

import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'

type RouteParams = {
  params: Promise<{ deletionGroupId: string }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const originResponse = mutatingOriginGuardResponse(req)
  if (originResponse) return originResponse

  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  const { deletionGroupId } = await params

  try {
    const result = await lifecycleRepository.restoreDeletionGroup(practitionerId, deletionGroupId)
    return NextResponse.json({ ok: true, action: 'restored', ...result }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to restore records'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
