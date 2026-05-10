import { NextRequest, NextResponse } from 'next/server'

import { isSameOriginRequest } from '@/lib/auth/originGuard'
import { clearSessionCookie, getSessionTokenFromRequest } from '@/lib/auth/sessionCookies'
import { hashSessionToken } from '@/lib/auth/sessionTokens'
import * as authRepository from '@/lib/repositories/authRepository'

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: 'Cross-origin auth request rejected.' }, { status: 403 })
  }

  const token = getSessionTokenFromRequest(req)
  if (token) {
    await authRepository.revokeAuthSession(hashSessionToken(token))
  }

  const response = NextResponse.json({ ok: true }, { status: 200 })
  clearSessionCookie(response)
  return response
}
