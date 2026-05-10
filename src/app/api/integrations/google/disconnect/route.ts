import { NextRequest, NextResponse } from 'next/server'

import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as googleIntegrationsRepository from '@/lib/repositories/googleIntegrationsRepository'

export async function POST(req: NextRequest) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  await googleIntegrationsRepository.disconnect(practitionerId)
  return NextResponse.json({ ok: true }, { status: 200 })
}
