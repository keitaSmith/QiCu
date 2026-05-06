import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as trashRepository from '@/lib/repositories/trashRepository'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  return NextResponse.json(trashRepository.listRawTrash(practitionerId), { status: 200 })
}
