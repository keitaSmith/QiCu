import { NextRequest, NextResponse } from 'next/server'

import { isAuthEnforcementStrict } from '@/lib/auth/requestScope'
import { getCurrentAuthSessionFromRequest } from '@/lib/auth/session'

const AUTH_ENFORCEMENT_HEADER = 'x-qicu-auth-enforcement'

function authStateResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status })
  response.headers.set(AUTH_ENFORCEMENT_HEADER, isAuthEnforcementStrict() ? 'strict' : 'legacy')
  return response
}

function safeAuthState(context: NonNullable<Awaited<ReturnType<typeof getCurrentAuthSessionFromRequest>>>) {
  return {
    authenticated: true,
    user: {
      email: context.user.email,
      name: context.user.name ?? undefined,
    },
    practitioner: context.practitioner?.id
      ? {
          id: context.practitioner.id,
          name: context.practitioner.name,
        }
      : null,
  }
}

export async function GET(req: NextRequest) {
  const context = await getCurrentAuthSessionFromRequest(req)
  if (!context) {
    return authStateResponse({ authenticated: false })
  }

  return authStateResponse(safeAuthState(context))
}
