import { NextRequest, NextResponse } from 'next/server'

import { exchangeGoogleAuthCode, fetchGoogleUserEmail } from '@/lib/google/auth'
import { consumeGoogleOAuthState, saveGoogleIntegration } from '@/lib/google/store'

function closeWindowHtml(message: string, success: boolean) {
  const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>QiCu Google Calendar</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px;">
    <h1 style="font-size: 18px; margin-bottom: 12px;">${success ? 'Google Calendar connected' : 'Google Calendar connection failed'}</h1>
    <p style="margin-bottom: 16px;">${safeMessage}</p>
    <script>
      try {
        window.opener?.postMessage({ type: 'qicu-google-oauth', success: ${success ? 'true' : 'false'} }, '*')
      } catch (err) {}
      window.close()
    </script>
  </body>
</html>`
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim()
  const state = req.nextUrl.searchParams.get('state')?.trim()
  const error = req.nextUrl.searchParams.get('error')?.trim()

  if (error) {
    return new NextResponse(closeWindowHtml(`Google returned: ${error}`, false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (!code || !state) {
    return new NextResponse(closeWindowHtml('Missing Google auth code or state.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const pending = consumeGoogleOAuthState(state)
  if (!pending) {
    return new NextResponse(closeWindowHtml('Google auth state expired. Please try again.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  try {
    const tokens = await exchangeGoogleAuthCode(code, req)
    const email = await fetchGoogleUserEmail(tokens.access_token)

    saveGoogleIntegration({
      practitionerId: pending.practitionerId,
      connected: true,
      googleUserEmail: email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      lastError: null,
      connectedAt: new Date().toISOString(),
    })

    return new NextResponse(closeWindowHtml('You can return to QiCu now.', true), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (nextError: any) {
    return new NextResponse(
      closeWindowHtml(nextError?.message ?? 'Could not connect Google Calendar.', false),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  }
}
