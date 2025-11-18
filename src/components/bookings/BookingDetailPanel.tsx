'use client'

import type { Booking } from '@/models/booking'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { dateFmt as dt, timeFmt } from '@/lib/dates'

type Props = {
  booking: Booking
  patientName: string
}

export function BookingDetailPanel({ booking, patientName }: Props) {
  const start = new Date(booking.start)
  const end = new Date(booking.end)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            Booking
          </p>
          <h2 className="text-base font-semibold text-ink">{booking.service}</h2>
          <p className="text-xs text-ink/60">
            {patientName} · {dt.format(start)} · {timeFmt.format(start)} –{' '}
            {timeFmt.format(end)}
          </p>
          <p className="text-xs text-ink/60">Code: {booking.code}</p>
        </div>
        <StatusBadge status={booking.status} showText />
      </div>

      <section className="rounded-2xl border border-brand-300/40 bg-surface p-4 text-sm text-ink/80 space-y-1">
        <p>Resource: {booking.resource ?? '—'}</p>
      </section>
    </div>
  )
}
