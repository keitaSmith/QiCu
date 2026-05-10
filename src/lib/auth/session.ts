import type { NextRequest } from 'next/server'

import { getSessionTokenFromRequest } from './sessionCookies'
import { hashSessionToken } from './sessionTokens'
import {
  getValidAuthSessionContextByTokenHash,
  touchAuthSession,
} from '@/lib/repositories/authRepository'

export type CurrentAuthSession = Awaited<ReturnType<typeof getValidAuthSessionContextByTokenHash>>

export async function getCurrentAuthSessionFromRequest(request: NextRequest | Request) {
  const token = getSessionTokenFromRequest(request)
  if (!token) return null

  const tokenHash = hashSessionToken(token)
  const context = await getValidAuthSessionContextByTokenHash(tokenHash)
  if (!context) return null

  await touchAuthSession(tokenHash)
  return context
}
