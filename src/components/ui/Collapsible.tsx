'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/cn'

type CollapsibleProps = {
  title: string
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}

export function Collapsible({
  title,
  count,
  defaultOpen = true,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {typeof count === 'number' && (
            <span className="rounded-full border border-brand-300/60 bg-brand-300/10 px-2 py-0.5 text-xs text-brand-900">
              {count}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs font-medium text-ink/70 hover:text-ink"
        >
          {open ? 'Hide' : 'Show'}
          <ChevronDownIcon
            className={cn(
              'h-3 w-3 transition-transform',
              open ? 'rotate-180' : 'rotate-0',
            )}
          />
        </button>
      </header>

      <div
        className={cn(
          'overflow-hidden transition-[max-height] duration-300',
          open ? 'max-h-[9999px]' : 'max-h-0',
        )}
      >
        <div className="py-0">{children}</div>
      </div>
    </section>
  )
}
