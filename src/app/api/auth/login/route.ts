import { NextRequest, NextResponse } from 'next/server'

import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { verifyPassword } from '@/lib/auth/password'
import { setSessionCookie } from '@/lib/auth/sessionCookies'
import { createSessionExpiryDate, generateSessionToken, hashSessionToken } from '@/lib/auth/sessionTokens'
import * as authRepository from '@/lib/repositories/authRepository'

const INVALID_CREDENTIALS_RESPONSE = { error: 'Invalid email or password.' }

function safeAuthUser(user: { email: string; name: string | null }) {
  return {
    email: user.email,
    name: user.name ?? undefined,
  }
}

async function parseLoginBody(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') return null

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !password) return null

    return { email, password }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const originResponse = mutatingOriginGuardResponse(req)
  if (originResponse) return originResponse

  const parsed = await parseLoginBody(req)
  if (!parsed) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const user = await authRepository.getUserByEmail(parsed.email)
  const credential = user ? await authRepository.getPasswordCredentialByUserId(user.id) : null
  const isValid =
    user && credential
      ? await verifyPassword(parsed.password, credential.passwordHash, credential.passwordAlgorithm)
      : false

  if (!user || !credential || !isValid) {
    return NextResponse.json(INVALID_CREDENTIALS_RESPONSE, { status: 401 })
  }

  const sessionToken = generateSessionToken()
  const sessionTokenHash = hashSessionToken(sessionToken)
  await authRepository.createAuthSession(user.id, sessionTokenHash, createSessionExpiryDate(), {
    userAgent: req.headers.get('user-agent'),
  })

  const response = NextResponse.json({ ok: true, user: safeAuthUser(user) }, { status: 200 })
  setSessionCookie(response, sessionToken)
  return response
}
