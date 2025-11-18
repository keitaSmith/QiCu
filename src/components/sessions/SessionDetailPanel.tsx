'use client'

import type { Session } from '@/models/session'
import { dateFmt as dt, timeFmt } from '@/lib/dates'

type Props = {
  session: Session
  patientName: string
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <p>
      <span className="font-medium text-ink">{label}: </span>
      <span className="text-ink/80">{value}</span>
    </p>
  )
}

export function SessionDetailPanel({ session, patientName }: Props) {
  const when = new Date(session.startDateTime)
  const techniques = (session.techniques ?? []).join(', ')
  const pointsUsed = (session.pointsUsed ?? []).join(', ')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/60">
          Session
        </p>
        <h2 className="text-base font-semibold text-ink">{patientName}</h2>
        <p className="text-xs text-ink/60">
          {dt.format(when)} · {timeFmt.format(when)}
        </p>
      </div>

      <section className="rounded-2xl border border-brand-300/40 bg-surface p-4 space-y-2 text-sm">
        <DetailRow label="Chief complaint" value={session.chiefComplaint} />
        <DetailRow label="Techniques" value={techniques || undefined} />
        <DetailRow label="Points used" value={pointsUsed || undefined} />
        <DetailRow label="Notes" value={session.treatmentNotes as any} />

        {/* You can add more fields from Session here if needed later
            (subjective, objective, diagnosis, plan, etc.) */}
      </section>
    </div>
  )
}
