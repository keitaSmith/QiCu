import type { NextRequest, NextResponse } from 'next/server'

import { SESSION_DURATION_DAYS } from './sessionTokens'

export const AUTH_SESSION_COOKIE_NAME = 'qicu_session'
export const AUTH_SESSION_MAX_AGE_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, token, getSessionCookieOptions())
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
  })
}

export function getSessionTokenFromRequest(request: NextRequest | Request) {
  const nextRequest = request as NextRequest
  const cookieValue = nextRequest.cookies?.get(AUTH_SESSION_COOKIE_NAME)?.value
  if (cookieValue) return cookieValue

  const rawCookie = request.headers.get('cookie')
  if (!rawCookie) return null

  for (const part of rawCookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')
    if (rawName === AUTH_SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join('='))
    }
  }

  return null
}
