import { NextRequest, NextResponse } from 'next/server'

import { listTrash } from '@/lib/dataLifecycle'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  return NextResponse.json(listTrash(practitionerId), { status: 200 })
}
