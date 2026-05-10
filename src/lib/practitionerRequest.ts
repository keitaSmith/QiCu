import type { NextResponse } from 'next/server'

import { authScopeErrorResponse, getPractitionerScopeForRequest } from '@/lib/auth/requestScope'

export async function getPractitionerIdFromRequest(req: Request): Promise<string> {
  return (await getPractitionerScopeForRequest(req)).practitionerId
}

export async function getPractitionerIdOrAuthResponse(req: Request): Promise<
  | { practitionerId: string; response: null }
  | { practitionerId: null; response: NextResponse }
> {
  try {
    return {
      practitionerId: await getPractitionerIdFromRequest(req),
      response: null,
    }
  } catch (error) {
    const response = authScopeErrorResponse(error)
    if (response) {
      return {
        practitionerId: null,
        response,
      }
    }
    throw error
  }
}

export { authScopeErrorResponse, getPractitionerScopeForRequest } from '@/lib/auth/requestScope'
