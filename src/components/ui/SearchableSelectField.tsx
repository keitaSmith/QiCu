'use client'

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { cn } from '@/lib/cn'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type SearchableSelectOption<T extends string> = {
  value: T
  label: string
  description?: string
  icon?: ReactNode
}

type Props<T extends string> = {
  label?: string
  value: T | null
  onChange: (value: T) => void
  options: Array<SearchableSelectOption<T>>
  placeholder?: string
  searchPlaceholder?: string
  noResultsText?: string
  required?: boolean
  helperText?: string
  error?: string
  disabled?: boolean
  className?: string
}

export default function SearchableSelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  searchPlaceholder = 'Type to search…',
  noResultsText = 'No matches found.',
  required,
  helperText,
  error,
  disabled,
  className,
}: Props<T>) {
  const [query, setQuery] = useState('')
  const selectedOption = options.find(option => option.value === value) ?? null

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter(option => {
      const haystacks = [option.label, option.description ?? '']
      return haystacks.some(value => value.toLowerCase().includes(needle))
    })
  }, [options, query])

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1 block text-xs text-ink/60">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      )}

      <Combobox
        value={value}
        onChange={next => {
          if (next) onChange(next)
          setQuery('')
        }}
        disabled={disabled}
        immediate
      >
        <div className="relative mt-0.5">
          <div
            className={cn(
              'flex w-full items-center gap-2 border-0 border-b bg-transparent px-0 py-2 text-sm text-ink transition-colors',
              error ? 'border-rose-500 focus-within:border-rose-500' : 'border-brand-300/40 focus-within:border-brand-300',
              disabled ? 'cursor-not-allowed opacity-60' : '',
            )}
          >
            <ComboboxInput
              className="w-full border-none bg-transparent p-0 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-0"
              displayValue={(selected: T | null) => options.find(option => option.value === selected)?.label ?? ''}
              onChange={event => setQuery(event.target.value)}
              placeholder={selectedOption ? selectedOption.label : placeholder}
              autoComplete="off"
            />
            <ComboboxButton className="shrink-0 text-ink/40 focus:outline-none">
              <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
            </ComboboxButton>
          </div>

          <ComboboxOptions
            anchor="bottom start"
            className="z-20 mt-1 max-h-60 min-w-[var(--button-width)] overflow-auto rounded-md bg-surface text-sm shadow-lg ring-1 ring-black/5 focus:outline-none empty:invisible"
          >
            <div className="px-3 py-2 text-xs text-ink/50">{query ? searchPlaceholder : 'Start typing or choose from the list.'}</div>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink/60">{noResultsText}</div>
            ) : (
              filteredOptions.map(option => (
                <ComboboxOption
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
                      {option.icon && <span className="mr-2 flex h-4 w-4 items-center justify-center">{option.icon}</span>}
                      <div className="min-w-0">
                        <div className={cn('truncate', selected && 'font-medium')}>{option.label}</div>
                        {option.description ? (
                          <div className="truncate text-xs text-ink/60">{option.description}</div>
                        ) : null}
                      </div>
                      {selected ? (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <CheckIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>

      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : helperText ? <p className="mt-1 text-xs text-ink/60">{helperText}</p> : null}
    </div>
  )
}
