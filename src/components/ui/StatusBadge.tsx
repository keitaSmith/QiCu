'use client'

import { cn } from '@/lib/cn'
import type { Booking } from '@/models/booking'
import type { PatientStatus } from '@/models/patient' // 'active' | 'inactive'

/**
 * We allow either booking statuses or patient statuses.
 * Backwards compatible with all current usages.
 */
type AnyStatus = Booking['status'] | PatientStatus

// outer wrapper uses text-* for the dot and bg-*/10 for the halo
const COLORS: Record<AnyStatus, string> = {
  // Booking statuses (unchanged)
  completed: 'text-emerald-600 bg-emerald-600/10',
  confirmed: 'text-brand-700 bg-brand-700/10',
  pending:   'text-amber-600 bg-amber-600/10',
  'in-progress': 'text-sky-700 bg-sky-700/10',
  cancelled: 'text-rose-600 bg-rose-600/10',
  'no-show': 'text-orange-600 bg-orange-500/10',

  // Patient statuses (new → mapped to existing palette)
  active:   'text-emerald-600 bg-emerald-600/10',
  inactive: 'text-rose-600 bg-rose-600/10',       // same as cancelled (red)
}

function pretty(status: AnyStatus) {
  if (status === 'completed') return 'Completed'
  if (status === 'in-progress') return 'In progress'
  if (status === 'no-show') return 'No-show'
  return status.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function StatusBadge({
  status,
  showText = true,
  className,
  dotSize = 'md',
  spacing = 'sm',
}: {
  status: AnyStatus
  /** show the status label next to the dot */
  showText?: boolean
  /** overall wrapper extra classes */
  className?: string
  /** dot sizes: 'sm' (12px), 'md' (14px) */
  dotSize?: 'sm' | 'md'
  /** gap between dot and text */
  spacing?: 'xs' | 'sm'
}) {
  const s = COLORS[status] ?? 'text-slate-600 bg-slate-400/20'
  const dot = dotSize === 'sm' ? 'p-0.5' : 'p-1'
  const gap = spacing === 'xs' ? 'gap-1.5' : 'gap-2'

  return (
    <span className={cn('inline-flex items-center', gap, className)}>
      <span className={cn('flex-none rounded-full', s, dot)}>
        <span className={cn('block rounded-full bg-current', dotSize === 'sm' ? 'size-1.5' : 'size-2')} />
      </span>
      {showText && (
        <span className="hidden sm:inline text-sm text-ink">{pretty(status)}</span>
      )}
    </span>
  )
}
