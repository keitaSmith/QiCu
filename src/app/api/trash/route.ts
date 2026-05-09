import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as trashRepository from '@/lib/repositories/trashRepository'

export async function GET(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  return NextResponse.json(await trashRepository.listRawTrash(practitionerId), { status: 200 })
}
