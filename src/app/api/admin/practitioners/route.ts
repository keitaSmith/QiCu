import { NextRequest, NextResponse } from 'next/server'

import { adminAccessErrorResponse, requireAdminOperator } from '@/lib/auth/adminAccess'
import { listPractitionersForAdmin } from '@/lib/repositories/practitionersRepository'

export async function GET(req: NextRequest) {
  try {
    await requireAdminOperator(req)
  } catch (error) {
    const response = adminAccessErrorResponse(error)
    if (response) return response
    throw error
  }

  const practitioners = await listPractitionersForAdmin()

  return NextResponse.json({
    practitioners: practitioners.map(practitioner => ({
      id: practitioner.id,
      name: practitioner.name,
      email: practitioner.email,
      linkedToUser: practitioner.linkedToUser,
    })),
  })
}
