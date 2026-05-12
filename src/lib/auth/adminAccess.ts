import { NextResponse } from 'next/server'

import { hasUserRole } from '@/lib/repositories/authRepository'
import { getCurrentAuthSessionFromRequest } from './session'

export type AdminOperatorContext = {
  email: string
  name?: string
}

export class AdminAccessError extends Error {
  readonly status: 401 | 403

  constructor(message: string, status: 401 | 403) {
    super(message)
    this.name = 'AdminAccessError'
    this.status = status
  }
}

export function parseAdminEmails(env = process.env) {
  return new Set(
    (env.QICU_ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminEmail(email: string, env = process.env) {
  return parseAdminEmails(env).has(email.trim().toLowerCase())
}

export function adminAccessErrorResponse(error: unknown) {
  if (!(error instanceof AdminAccessError)) return null
  return NextResponse.json({ error: error.message }, { status: error.status })
}

export async function requireAdminOperator(request: Request): Promise<AdminOperatorContext> {
  const context = await getCurrentAuthSessionFromRequest(request)
  if (!context) {
    throw new AdminAccessError('Authentication is required.', 401)
  }

  if (!(await hasUserRole(context.user.id, 'admin')) && !isAdminEmail(context.user.email)) {
    throw new AdminAccessError('Admin access is required.', 403)
  }

  return {
    email: context.user.email,
    name: context.user.name ?? undefined,
  }
}
