import { NextRequest, NextResponse } from 'next/server'

import { getCurrentAuthSessionFromRequest } from '@/lib/auth/session'

function safeAuthState(context: NonNullable<Awaited<ReturnType<typeof getCurrentAuthSessionFromRequest>>>) {
  return {
    authenticated: true,
    user: {
      email: context.user.email,
      name: context.user.name ?? undefined,
    },
    practitioner: context.practitioner?.id
      ? {
          id: context.practitioner.id,
          name: context.practitioner.name,
        }
      : null,
  }
}

export async function GET(req: NextRequest) {
  const context = await getCurrentAuthSessionFromRequest(req)
  if (!context) {
    return NextResponse.json({ authenticated: false }, { status: 200 })
  }

  return NextResponse.json(safeAuthState(context), { status: 200 })
}
