import { NextRequest, NextResponse } from 'next/server'

import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function POST(req: NextRequest) {
  const originResponse = mutatingOriginGuardResponse(req)
  if (originResponse) return originResponse

  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  await googleIntegrationsRepository.disconnect(practitionerId)
  return NextResponse.json({ ok: true }, { status: 200 })
}
