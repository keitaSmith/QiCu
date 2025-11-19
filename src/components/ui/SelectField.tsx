'use client'

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

export type SelectOption<T extends string> = {
  value: T
  label: string
  description?: string
  icon?: ReactNode
}

export type SelectFieldProps<T extends string> = {
  label?: string
  value: T | null
  onChange: (value: T) => void
  options: Array<SelectOption<T>>
  placeholder?: string
  required?: boolean
  helperText?: string
  error?: string
  disabled?: boolean
  className?: string
  /**
   * default: full underlined field
   * unstyled: for embedding inside something else (e.g. PhoneField)
   */
  variant?: 'default' | 'unstyled'
  /**
   * Extra classes for the dropdown menu (width, etc.)
   */
  menuClassName?: string
  /**
   * Custom render for the closed button display (e.g. flag-only)
   */
  renderDisplay?: (option: SelectOption<T> | null) => ReactNode
}

export default function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  required,
  helperText,
  error,
  disabled,
  className,
  variant = 'default',
  menuClassName,
  renderDisplay,
}: SelectFieldProps<T>) {
  const selectedOption = options.find(opt => opt.value === value) ?? null
  const normalizedValue = (value ?? '') as T
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1 block text-xs text-ink/60">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      )}

      <Listbox value={normalizedValue} onChange={onChange} disabled={disabled}>
        <div className="relative mt-0.5">
          <ListboxButton
            className={cn(
              'flex w-full items-center justify-between bg-transparent px-0 text-left text-sm',
              variant === 'default' ? 'py-2' : 'py-0',
              'text-ink transition-colors focus:outline-none focus:ring-0',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              variant === 'default' &&
                (error
                  ? 'border-0 border-b border-rose-500 focus:border-rose-500'
                  : 'border-0 border-b border-brand-300/40 focus:border-brand-300'),
            )}
          >
            <span
              className={cn(
                'flex min-w-0 items-center gap-1 truncate',
                !selectedOption && 'text-ink/40',
              )}
            >
              {renderDisplay
                ? renderDisplay(selectedOption)
                : selectedOption?.label ?? placeholder}
            </span>
            <ChevronUpDownIcon
              className="ml-2 h-4 w-4 shrink-0 text-ink/40"
              aria-hidden="true"
            />
          </ListboxButton>

          {/* DROPDOWN PANEL */}
          <ListboxOptions
            className={cn(
              'absolute left-0 z-20 mt-1 min-w-full rounded-md bg-surface text-sm shadow-lg ring-1 ring-black/5 focus:outline-none overflow-hidden',
              menuClassName,
            )}
          >
            {/* Inner scroll container so corners stay rounded */}
            <div className="max-h-60 overflow-auto">
              {options.map(option => (
                <ListboxOption
                  key={option.value}
                  value={option.value}
                  className={({ active }) =>
                    cn(
                      'relative flex cursor-pointer select-none items-center py-2 pl-3 pr-9 text-sm',
                      active ? 'bg-brand-50 text-brand-900' : 'text-ink',
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      {option.icon && (
                        <span className="mr-2 flex h-4 w-4 items-center justify-center">
                          {option.icon}
                        </span>
                      )}
                      <span
                        className={cn(
                          'block truncate',
                          selected && 'font-medium',
                        )}
                      >
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="ml-2 text-xs text-ink/60">
                          {option.description}
                        </span>
                      )}
                      {selected && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <CheckIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
              ))}
            </div>
          </ListboxOptions>
        </div>
      </Listbox>

      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-ink/60">{helperText}</p>
      ) : null}
    </div>
  )
}
