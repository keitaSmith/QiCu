import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  googleIntegrationsRepository.disconnect(practitionerId)
  return NextResponse.json({ ok: true }, { status: 200 })
}
