import type { NextRequest } from 'next/server'

import { createGoogleOAuthState, getGoogleIntegration, saveGoogleIntegration } from '@/lib/google/store'
import type { GoogleIntegrationRecord } from '@/lib/google/types'

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
]

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}. Add it to your environment before using Google Calendar sync.`)
  }
  return value
}

export function hasGoogleCalendarEnv() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  )
}

export function getGoogleRedirectUri(req: NextRequest | Request) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim()
  if (configured) return configured

  const url = new URL(req.url)
  return `${url.origin}/api/integrations/google/callback`
}

export function buildGoogleAuthUrl(practitionerId: string, req: NextRequest) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID')
  const state = createGoogleOAuthState(practitionerId)
  const redirectUri = getGoogleRedirectUri(req)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES.join(' '),
    state,
  })

  return `${GOOGLE_AUTH_BASE}?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

export async function exchangeGoogleAuthCode(code: string, req: NextRequest) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET')
  const redirectUri = getGoogleRedirectUri(req)

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token exchange failed: ${text}`)
  }

  return (await res.json()) as TokenResponse
}

export async function fetchGoogleUserEmail(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) return undefined
  const data = (await res.json()) as { email?: string }
  return data.email?.trim()
}

export async function ensureFreshGoogleAccessToken(
  practitionerId: string,
): Promise<GoogleIntegrationRecord> {
  const record = getGoogleIntegration(practitionerId)

  if (!record.connected || !record.accessToken) {
    throw new Error('Google Calendar is not connected for this practitioner.')
  }

  const expiresSoon =
    typeof record.tokenExpiry === 'number' && record.tokenExpiry <= Date.now() + 30_000

  if (!expiresSoon) return record

  if (!record.refreshToken) {
    throw new Error('Google refresh token is missing. Please reconnect the account.')
  }

  const clientId = requireEnv('GOOGLE_CLIENT_ID')
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET')

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: record.refreshToken,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google token refresh failed: ${text}`)
  }

  const data = (await res.json()) as TokenResponse
  const updated: GoogleIntegrationRecord = {
    ...record,
    accessToken: data.access_token,
    tokenExpiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    lastError: null,
  }

  saveGoogleIntegration(updated)
  return updated
}
