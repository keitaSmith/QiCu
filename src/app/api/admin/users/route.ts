import { NextRequest, NextResponse } from 'next/server'

import { adminAccessErrorResponse, requireAdminOperator } from '@/lib/auth/adminAccess'
import { mutatingOriginGuardResponse } from '@/lib/auth/originGuard'
import { provisionAuthUser } from '@/lib/auth/provisionUser'

type AdminCreateUserBody = {
  email?: unknown
  name?: unknown
  password?: unknown
  practitionerId?: unknown
  allowRelink?: unknown
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Unable to provision user.'

  if (
    error.message.startsWith('Unknown practitioner public ID:') ||
    error.message.includes('was not found in the database') ||
    error.message.includes('already linked') ||
    error.message.includes('Password must be')
  ) {
    return error.message
  }

  return 'Unable to provision user.'
}

export async function POST(req: NextRequest) {
  const originGuard = mutatingOriginGuardResponse(req)
  if (originGuard) return originGuard

  try {
    await requireAdminOperator(req)
  } catch (error) {
    const response = adminAccessErrorResponse(error)
    if (response) return response
    throw error
  }

  let body: AdminCreateUserBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const email = readString(body.email).toLowerCase()
  const name = readString(body.name)
  const password = typeof body.password === 'string' ? body.password : ''
  const practitionerId = readString(body.practitionerId)
  const allowRelink = body.allowRelink === true

  if (!email || !name || !password || !practitionerId) {
    return NextResponse.json({ error: 'email, name, password, and practitionerId are required.' }, { status: 400 })
  }

  try {
    const result = await provisionAuthUser({
      email,
      name,
      password,
      practitionerId,
      allowRelink,
    })

    return NextResponse.json({
      ok: true,
      user: {
        email: result.email,
        name: result.name,
      },
      practitioner: {
        id: result.practitionerId,
        name: result.practitionerName,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 400 })
  }
}
