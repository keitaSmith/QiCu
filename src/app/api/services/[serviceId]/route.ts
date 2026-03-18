import { NextRequest, NextResponse } from 'next/server'

import { servicesStore } from '@/data/servicesStore'
import type { Service } from '@/models/service'
import { getPractitionerIdFromRequest } from '@/lib/practitioners'

type RouteParams = {
  params: Promise<{ serviceId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const service = servicesStore.find(item => item.id === serviceId && item.practitionerId === practitionerId)

  if (!service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  return NextResponse.json(service)
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const index = servicesStore.findIndex(item => item.id === serviceId && item.practitionerId === practitionerId)

  if (index === -1) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<Service>
  const current = servicesStore[index]
  const nextName = typeof body.name === 'string' ? body.name.trim() : current.name
  const nextDurationMinutes = body.durationMinutes === undefined ? current.durationMinutes : Number(body.durationMinutes)

  if (!nextName) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (!Number.isFinite(nextDurationMinutes) || nextDurationMinutes <= 0) {
    return NextResponse.json({ error: 'durationMinutes must be greater than 0' }, { status: 400 })
  }

  const duplicate = servicesStore.find(
    service =>
      service.id !== serviceId &&
      service.practitionerId === practitionerId &&
      service.name.trim().toLowerCase() === nextName.toLowerCase() &&
      service.durationMinutes === nextDurationMinutes,
  )

  if (duplicate) {
    return NextResponse.json(
      { error: 'A service with the same name and duration already exists' },
      { status: 409 },
    )
  }

  const updated: Service = {
    ...current,
    ...body,
    practitionerId,
    name: nextName,
    durationMinutes: nextDurationMinutes,
    description: typeof body.description === 'string' ? body.description.trim() || undefined : current.description,
    active: body.active ?? current.active,
  }

  servicesStore[index] = updated
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const practitionerId = getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const index = servicesStore.findIndex(item => item.id === serviceId && item.practitionerId === practitionerId)

  if (index === -1) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  servicesStore.splice(index, 1)
  return NextResponse.json({ ok: true }, { status: 200 })
}
