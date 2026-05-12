import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { isStrictAuthEnforcementEnabled } from './authMode'

const FORBIDDEN_RESPONSE = { error: 'Forbidden' }

export function isSameOriginRequest(request: NextRequest | Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function isClearlyCrossSiteRequest(request: NextRequest | Request, env = process.env) {
  const origin = request.headers.get('origin')
  if (origin) return !isSameOriginRequest(request)

  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (!isStrictAuthEnforcementEnabled(env) || !fetchSite) return false

  return fetchSite === 'cross-site'
}

export function mutatingOriginGuardResponse(request: NextRequest | Request, env = process.env) {
  if (!isClearlyCrossSiteRequest(request, env)) return null
  return NextResponse.json(FORBIDDEN_RESPONSE, { status: 403 })
}
