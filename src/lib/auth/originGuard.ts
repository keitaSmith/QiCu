import type { NextRequest } from 'next/server'

export function isSameOriginRequest(request: NextRequest | Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}
