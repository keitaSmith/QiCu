'use client'

import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export type RadioOption<T extends string> = {
  value: T
  label: string
  description?: string
}

export type RadioFieldProps<T extends string> = {
  label?: string
  value: T
  onChange: (value: T) => void
  options: Array<RadioOption<T>>
  inline?: boolean
  required?: boolean
  error?: string
  helperText?: string
  className?: string
}

export default function RadioField<T extends string>({
  label,
  value,
  onChange,
  options,
  inline = true,
  required,
  error,
  helperText,
  className,
}: RadioFieldProps<T>) {
  return (
    <fieldset className={cn('w-full', className)}>
      {label && (
        <legend className="mb-1 block text-xs text-ink/60">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </legend>
      )}

      <div
        className={cn(
          inline
            ? 'flex items-center gap-6 mt-1'
            : 'flex flex-col gap-4 mt-2'
        )}
      >
        {options.map(opt => (
          <label
            key={opt.value}
            className="flex items-center cursor-pointer select-none"
          >
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className={cn(
                `
                  relative h-4 w-4 appearance-none rounded-full border 
                  border-brand-300/60 bg-white 
                  checked:border-brand-600 checked:bg-brand-600 

                  before:absolute before:rounded-full before:bg-white
                  before:inset-0 before:m-auto before:h-1.5 before:w-1.5 
                  checked:before:bg-canvas

                  focus-visible:outline-none focus-visible:ring-2 
                  focus-visible:ring-brand-300 focus-visible:ring-offset-1
                  
                  disabled:opacity-40
                `
              )}
            />
            <span className="ml-2 text-sm text-ink">{opt.label}</span>
          </label>
        ))}
      </div>

      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-ink/60">{helperText}</p>
      ) : null}
    </fieldset>
  )
}
