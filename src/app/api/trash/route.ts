import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdOrAuthResponse } from '@/lib/practitionerRequest'
import * as trashRepository from '@/lib/repositories/trashRepository'

export async function GET(req: NextRequest) {
  const scope = await getPractitionerIdOrAuthResponse(req)
  if (scope.response) return scope.response
  const practitionerId = scope.practitionerId
  return NextResponse.json(await trashRepository.listRawTrash(practitionerId), { status: 200 })
}
