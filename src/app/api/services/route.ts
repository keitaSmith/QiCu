import { NextRequest, NextResponse } from 'next/server'

import { servicesStore } from '@/data/servicesStore'
import type { Service } from '@/models/service'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(req: NextRequest) {
  const practitionerId = getPractitionerIdFromRequest(req)
  return NextResponse.json(servicesStore.filter(service => service.practitionerId === practitionerId), { status: 200 })
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

  const duplicate = servicesStore.find(
    service =>
      service.practitionerId === practitionerId &&
      service.name.trim().toLowerCase() === name.toLowerCase() &&
      service.durationMinutes === durationMinutes,
  )

  if (duplicate) {
    return NextResponse.json(
      { error: 'A service with the same name and duration already exists' },
      { status: 409 },
    )
  }

  const created: Service = {
    id: `${slugify(practitionerId)}-${slugify(name)}-${durationMinutes}-${Math.random().toString(36).slice(2, 6)}`,
    practitionerId,
    name,
    durationMinutes,
    description,
    active,
  }

  servicesStore.unshift(created)

  return NextResponse.json(created, { status: 201 })
}
