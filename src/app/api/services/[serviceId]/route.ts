import { NextRequest, NextResponse } from 'next/server'

import type { Service } from '@/models/service'
import { getPractitionerIdFromRequest } from '@/lib/practitionerRequest'
import * as lifecycleRepository from '@/lib/repositories/lifecycleRepository'
import * as servicesRepository from '@/lib/repositories/servicesRepository'

type RouteParams = {
  params: Promise<{ serviceId: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const service = await servicesRepository.getById(practitionerId, serviceId)

  if (!service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  return NextResponse.json(service)
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const current = await servicesRepository.getById(practitionerId, serviceId)

  if (!current) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<Service>
  const nextName = typeof body.name === 'string' ? body.name.trim() : current.name
  const nextDurationMinutes = body.durationMinutes === undefined ? current.durationMinutes : Number(body.durationMinutes)

  if (!nextName) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  if (!Number.isFinite(nextDurationMinutes) || nextDurationMinutes <= 0) {
    return NextResponse.json({ error: 'durationMinutes must be greater than 0' }, { status: 400 })
  }

  const duplicate = await servicesRepository.findDuplicate(practitionerId, nextName, nextDurationMinutes, {
    excludeServiceId: serviceId,
  })

  if (duplicate) {
    return NextResponse.json(
      { error: 'A service with the same name and duration already exists' },
      { status: 409 },
    )
  }

  const updated = await servicesRepository.update(practitionerId, serviceId, {
    ...body,
    name: nextName,
    durationMinutes: nextDurationMinutes,
    description: typeof body.description === 'string' ? body.description.trim() || undefined : current.description,
    active: body.active ?? current.active,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const practitionerId = await getPractitionerIdFromRequest(req)
  const { serviceId } = await params
  const service = await servicesRepository.getById(practitionerId, serviceId)

  if (!service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const impact = lifecycleRepository.getServiceLifecycleImpact(practitionerId, serviceId)
  const result = lifecycleRepository.moveServiceToTrash(practitionerId, serviceId)
  return NextResponse.json(
    {
      ok: true,
      action: 'moved-to-trash',
      restoreUntil: result.restoreUntil,
      deletionGroupId: result.deletionGroupId,
      impact,
    },
    { status: 200 },
  )
}
