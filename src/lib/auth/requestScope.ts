import { NextResponse } from 'next/server'

import { CURRENT_PRACTITIONER_HEADER } from '@/lib/practitioners'
import * as practitionersRepository from '@/lib/repositories/practitionersRepository'
import { getCurrentAuthSessionFromRequest } from './session'

export type PractitionerScopeSource = 'session' | 'legacy-header'

export type PractitionerRequestScope = {
  practitionerId: string
  user?: {
    email: string
    name?: string
  }
  source: PractitionerScopeSource
}

export class AuthScopeError extends Error {
  readonly status: 401 | 403

  constructor(message: string, status: 401 | 403 = 401) {
    super(message)
    this.name = 'AuthScopeError'
    this.status = status
  }
}

export function isAuthEnforcementStrict() {
  return process.env.QICU_AUTH_ENFORCEMENT === 'strict'
}

export function authScopeErrorResponse(error: unknown) {
  if (!(error instanceof AuthScopeError)) return null

  return NextResponse.json({ error: error.message }, { status: error.status })
}

export async function getAuthenticatedPractitionerScope(request: Request): Promise<PractitionerRequestScope | null> {
  const context = await getCurrentAuthSessionFromRequest(request)
  if (!context) return null

  if (!context.practitioner?.id) {
    throw new AuthScopeError('Authenticated user is not linked to a practitioner.', 403)
  }

  return {
    practitionerId: context.practitioner.id,
    user: {
      email: context.user.email,
      name: context.user.name ?? undefined,
    },
    source: 'session',
  }
}

export async function getPractitionerScopeForRequest(request: Request): Promise<PractitionerRequestScope> {
  const sessionScope = await getAuthenticatedPractitionerScope(request)
  if (sessionScope) return sessionScope

  if (isAuthEnforcementStrict()) {
    throw new AuthScopeError('Authentication is required.', 401)
  }

  const headerValue = request.headers.get(CURRENT_PRACTITIONER_HEADER)?.trim()
  return {
    practitionerId: await practitionersRepository.normalizePractitionerId(headerValue),
    source: 'legacy-header',
  }
}

export async function requireAuthenticatedPractitionerScope(request: Request): Promise<PractitionerRequestScope> {
  const sessionScope = await getAuthenticatedPractitionerScope(request)
  if (!sessionScope) {
    throw new AuthScopeError('Authentication is required.', 401)
  }
  return sessionScope
}
