import { NextRequest, NextResponse } from 'next/server'

import type { Service } from '@/models/service'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'
import * as servicesRepository from '@/lib/repositories/servicesRepository'

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  return NextResponse.json(servicesRepository.listByPractitionerIncludingDisabled(practitionerId), { status: 200 })
}

export async function POST(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const body = (await req.json()) as Partial<Service>
  const name = body.name?.trim()
  const durationMinutes = Number(body.durationMinutes)
  const description = body.description?.trim() || undefined
  const active = body.active ?? true

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: 'durationMinutes must be greater than 0' }, { status: 400 })
  }

  const duplicate = servicesRepository.findDuplicate(practitionerId, name, durationMinutes)

  if (duplicate) {
    return NextResponse.json(
      { error: 'A service with the same name and duration already exists' },
      { status: 409 },
    )
  }

  const created = servicesRepository.create(practitionerId, {
    name,
    durationMinutes,
    description,
    active,
  })

  return NextResponse.json(created, { status: 201 })
}
