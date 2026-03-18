'use client'

import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { cn } from '@/lib/cn'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  initialVisibleCount?: number
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
  initialVisibleCount = 10,
}: Props<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const selectedOption = options.find(option => option.value === value) ?? null

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options.slice(0, initialVisibleCount)

    return options.filter(option => {
      const haystacks = [option.label, option.description ?? '']
      return haystacks.some(entry => entry.toLowerCase().includes(needle))
    })
  }, [initialVisibleCount, options, query])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const inputValue = isOpen ? query : selectedOption?.label ?? ''

  return (
    <div ref={rootRef} className={cn('w-full', className)}>
      {label && (
        <label className="mb-1 block text-xs text-ink/60">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      )}

      <div className="relative mt-0.5">
        <div
          className={cn(
            'flex w-full items-center gap-2 border-0 border-b bg-transparent px-0 py-2 text-sm text-ink transition-colors',
            error ? 'border-rose-500 focus-within:border-rose-500' : 'border-brand-300/40 focus-within:border-brand-300',
            disabled ? 'cursor-not-allowed opacity-60' : '',
          )}
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onFocus={() => {
              if (disabled) return
              setIsOpen(true)
              setQuery('')
            }}
            onClick={() => {
              if (disabled) return
              setIsOpen(true)
            }}
            onChange={event => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            placeholder={isOpen ? searchPlaceholder : selectedOption ? selectedOption.label : placeholder}
            autoComplete="off"
            disabled={disabled}
            className="w-full border-none bg-transparent p-0 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            className="shrink-0 text-ink/40 focus:outline-none disabled:cursor-not-allowed"
            disabled={disabled}
            onClick={() => {
              const nextOpen = !isOpen
              setIsOpen(nextOpen)
              if (nextOpen) {
                setQuery('')
                inputRef.current?.focus()
              }
            }}
          >
            <ChevronUpDownIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {isOpen ? (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-surface text-sm shadow-lg ring-1 ring-black/5 focus:outline-none">
            <div className="px-3 py-2 text-xs text-ink/50">
              {query.trim() ? searchPlaceholder : `Showing ${Math.min(initialVisibleCount, options.length)} patients. Start typing to filter.`}
            </div>
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink/60">{noResultsText}</div>
            ) : (
              filteredOptions.map(option => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onMouseDown={event => {
                      event.preventDefault()
                      onChange(option.value)
                      setIsOpen(false)
                      setQuery('')
                    }}
                    className={cn(
                      'relative flex w-full items-center py-2 pl-3 pr-9 text-left text-sm text-ink hover:bg-brand-50 hover:text-brand-900',
                      selected ? 'bg-brand-50/60' : '',
                    )}
                  >
                    {option.icon ? <span className="mr-2 flex h-4 w-4 items-center justify-center">{option.icon}</span> : null}
                    <div className="min-w-0">
                      <div className={cn('truncate', selected && 'font-medium')}>{option.label}</div>
                      {option.description ? <div className="truncate text-xs text-ink/60">{option.description}</div> : null}
                    </div>
                    {selected ? (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3">
                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : helperText ? <p className="mt-1 text-xs text-ink/60">{helperText}</p> : null}
    </div>
  )
}
