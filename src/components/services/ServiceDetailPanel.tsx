'use client'

import type { Service } from '@/models/service'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function ServiceDetailPanel({ service }: { service: Service }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">Service</p>
          <h2 className="text-base font-semibold text-ink">{service.name}</h2>
          <p className="text-xs text-ink/60">{service.durationMinutes} minutes</p>
        </div>
        <StatusBadge status={service.active ? 'active' : 'inactive'} showText />
      </div>

      <section className="rounded-2xl border border-brand-300/40 bg-surface p-4 text-sm text-ink/80 space-y-1">
        <p>Description: {service.description?.trim() ? service.description : '—'}</p>
        <p>Availability: {service.active ? 'Available for new bookings' : 'Currently disabled for new bookings'}</p>
      </section>
    </div>
  )
}
