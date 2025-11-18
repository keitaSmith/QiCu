'use client'

import { FunnelIcon } from '@heroicons/react/24/outline'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { cn } from '@/lib/cn'

export type FilterOption<T extends string> = {
  value: T
  label: string
}

type FilterSelectProps<T extends string> = {
  value: T
  onChange: (value: T) => void
  options: FilterOption<T>[]
  className?: string // wrapper
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  className,
}: FilterSelectProps<T>) {
  return (
    <div className={cn('relative w-full sm:w-48', className)}>
      <FunnelIcon className="pointer-events-none absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" />
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className={cn(
          'w-full appearance-none rounded-lg border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm text-ink',
          'outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600',
        )}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
    </div>
  )
}
