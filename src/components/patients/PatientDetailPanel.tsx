'use client'

import type { ReactNode } from 'react'
import type { FhirPatient } from '@/models/patient'
import { toCoreView } from '@/models/patient.coreView'
import type { Booking } from '@/models/booking'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { dateFmt as dt, timeFmt } from '@/lib/dates'

type Props = {
  patient: FhirPatient
  bookingsForPatient?: Booking[]
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-brand-300/40 bg-surface p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/60 mb-2">
        {title}
      </h3>
      <div className="space-y-1 text-sm text-ink/80">{children}</div>
    </section>
  )
}

export function PatientDetailPanel({ patient, bookingsForPatient = [] }: Props) {
  const core = toCoreView(patient)

  const upcoming = bookingsForPatient
    .filter(b => new Date(b.start) >= new Date())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))

  const next = upcoming[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
            Patient
          </p>
          <h2 className="text-base font-semibold text-ink">
            {core.name}
          </h2>
          <p className="text-xs text-ink/60">ID: {core.id}</p>
        </div>
        <StatusBadge status={core.status as any} showText />
      </div>

      {/* Contact */}
      <Section title="Contact">
        <p>Email: {core.email || <span className="text-ink/50">Not set</span>}</p>
        <p>Mobile: {core.mobile || <span className="text-ink/50">Not set</span>}</p>
        {core.birthDate && (
          <p>
            Birth date:{' '}
            <span>
              {dt.format(new Date(core.birthDate))}
            </span>
          </p>
        )}
      </Section>

      {/* Next booking (if any) */}
      {next && (
        <Section title="Next booking">
          <p className="font-medium text-ink">
            {next.service}
          </p>
          <p>
            {dt.format(new Date(next.start))} · {timeFmt.format(new Date(next.start))} –{' '}
            {timeFmt.format(new Date(next.end))}
          </p>
          <p className="text-ink/70">
            Resource: {next.resource ?? '—'}
          </p>
          <p className="text-ink/70">
            Code: {next.code}
          </p>
          <StatusBadge status={next.status} showText className="mt-1" />
        </Section>
      )}
    </div>
  )
}
