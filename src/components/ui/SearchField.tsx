'use client'

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/cn'

type SearchFieldProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string      // wrapper (width/placement)
  inputClassName?: string // optional extra styles for input
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
}: SearchFieldProps) {
  return (
    <div className={cn('relative w-full sm:w-auto', className)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full sm:w-64 rounded-lg bg-surface border border-slate-300 pl-9 pr-3 py-2 text-sm text-ink',
          'outline-none placeholder:text-ink/50 focus:ring-1 focus:ring-brand-600 focus:border-brand-600',
          inputClassName,
        )}
      />
    </div>
  )
}
