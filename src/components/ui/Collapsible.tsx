'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/solid'
import { cn } from '@/lib/cn'

export function Collapsible({
  title,
  count,
  defaultOpen = true,
  children,
  className,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ref = useRef<HTMLDivElement>(null)

  // keep height in sync while open
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (open) el.style.maxHeight = `${el.scrollHeight}px`
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.maxHeight = open ? `${el.scrollHeight}px` : '0px'
  }, [open])

  return (
    <section className={cn('space-y-4', className)}>
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-ink">
          {title}
          {typeof count === 'number' && (
            <span className="ml-2 inline-flex rounded-full bg-brand-300/20 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-300/40">
              {count}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-ink/80 hover:bg-brand-300/15 focus:outline-none"
          aria-expanded={open}
          aria-controls={`collapsible-${title}`}
        >
          {open ? 'Hide' : 'Show'}
          <ChevronDownIcon className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')} />
        </button>
      </header>

      <div
        id={`collapsible-${title}`}
        ref={ref}
        className="overflow-hidden transition-[max-height] duration-300"
        style={{ maxHeight: defaultOpen ? '9999px' : '0px' }}
      >
        {/* IMPORTANT: exactly one wrapping child for height calc */}
        <div className="py-0">
          {children}
        </div>
      </div>
    </section>
  )
}
