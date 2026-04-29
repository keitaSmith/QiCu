import { NextRequest, NextResponse } from 'next/server'

import { disconnectGoogleIntegration } from '@/lib/google/store'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  disconnectGoogleIntegration(practitionerId)
  return NextResponse.json({ ok: true }, { status: 200 })
}
