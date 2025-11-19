'use client'

import { useMemo, useState } from 'react'
import PhoneInput from 'react-phone-number-input/input'
import {
  isValidPhoneNumber,
  getCountries,
  getCountryCallingCode,
} from 'react-phone-number-input'
import type { CountryCode } from 'libphonenumber-js/core'
import 'react-phone-number-input/style.css'
import { cn } from '@/lib/cn'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'
import parsePhoneNumberFromString from 'libphonenumber-js'

// Country names
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function countryLabel(code: CountryCode): string {
  const name = regionNames.of(code) ?? code
  const calling = getCountryCallingCode(code)
  return `${name} (+${calling})`
}

// flag-icons wrapper
function FlagIcon({ code }: { code: CountryCode }) {
  return (
    <span
      className={cn(
        'fi',
        `fi-${code.toLowerCase()}`,
        'inline-block h-4 w-6 rounded-sm',
      )}
    />
  )
}


// ✅ THE MISSING TYPE
export type PhoneFieldProps = {
  label?: string
  value: string | null
  onChange: (value: string | null) => void
  defaultCountry?: CountryCode
  required?: boolean
  error?: string
  helperText?: string
  disabled?: boolean
  className?: string
}

// ✅ NO MORE TS ERRORS — TYPE ANNOTATION IS HERE
export default function PhoneField({
  label,
  value,
  onChange,
  defaultCountry = 'CH' as CountryCode,
  required,
  error,
  helperText,
  disabled,
  className,
}: PhoneFieldProps) {
  const [touched, setTouched] = useState(false)
  const [country, setCountry] = useState<CountryCode>(defaultCountry)

  const showValidationError =
    touched && value && !isValidPhoneNumber(value ?? '') && !error

  // All countries as options for SelectField
const countryOptions: SelectOption<CountryCode>[] = useMemo(
  () =>
    getCountries()
      .map(c => {
        const code = c as CountryCode
        return {
          value: code,
          label: countryLabel(code),      // e.g. "El Salvador (+503)"
          icon: <FlagIcon code={code} />,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })),
  [],
)

const handleNumberChange = (val?: string) => {
  const nextVal = val || ''
  onChange(nextVal || null)

  if (!nextVal) return

  // Try to infer the country from the typed number (e.g. +1 868 -> TT)
  const parsed = parsePhoneNumberFromString(nextVal)

  if (parsed?.country) {
    const newCountry = parsed.country as CountryCode
    if (newCountry !== country) {
      setCountry(newCountry)
    }
  }
}
  const handleCountryChange = (next: CountryCode) => {
    const prev = country
    setCountry(next)

    const current = value ?? ''
    const newPrefix = `+${getCountryCallingCode(next)}`
    const prevPrefix = `+${getCountryCallingCode(prev)}`

    if (!current || current.trim() === '') {
      onChange(newPrefix)
      return
    }

    if (current.startsWith(prevPrefix)) {
      const rest = current.slice(prevPrefix.length)
      onChange(newPrefix + rest)
    } else {
      onChange(newPrefix)
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1 block text-xs text-ink/60">
          {label}
          {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
        </label>
      )}

      <div
        className={cn(
          'flex items-center gap-1 border-0 border-b bg-transparent py-2.25 text-sm leading-none',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text',
          error || showValidationError
            ? 'border-rose-500 focus-within:border-rose-500'
            : 'border-brand-300/40 focus-within:border-brand-300',
        )}
      >
        {/* Left: narrow country selector (flag + +code) */}
        <div className="w-12 shrink-0">
          <SelectField<CountryCode>
            value={country}
            onChange={handleCountryChange}
            options={countryOptions}
            placeholder="+Code"
            variant="unstyled"
            menuClassName="w-50"
            renderDisplay={opt => {
                if (!opt) {
                    return <span className="text-xs text-ink/40">Country</span>
                }
                return (
                    <span className="flex items-center gap-1">
                    <FlagIcon code={opt.value} />
                    </span>
                )
                }}

          />
        </div>

        {/* Right: phone number input */}
        <div className="flex-1 min-w-0">
          <PhoneInput
            country={country}
            value={value ?? ''}
            onChange={handleNumberChange}
            disabled={disabled}
            international
            withCountryCallingCode
            className="qi-phone-input w-full bg-transparent text-sm leading-none text-ink"
            onBlur={() => setTouched(true)}
          />
        </div>
      </div>

      {error ? (
        <p className="mt-1 text-xs text-rose-600">{error}</p>
      ) : showValidationError ? (
        <p className="mt-1 text-xs text-rose-600">
          Please enter a valid phone number.
        </p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-ink/60">{helperText}</p>
      ) : null}
    </div>
  )
}
