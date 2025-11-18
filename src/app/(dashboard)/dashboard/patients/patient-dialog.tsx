'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'
import type { NewPatientForm } from '@/lib/fhir/patient-builders'
import { DateField } from '@/components/ui/DateField'

type Mode = 'create' | 'edit'

const underlineInputClass = (hasError?: boolean) =>
  [
    'w-full px-0 py-2 bg-transparent border-0 border-b text-sm',
    'text-ink placeholder:text-ink/40',
    'focus:ring-0 focus:outline-none transition-colors',
    hasError ? 'border-rose-500 focus:border-rose-500' : 'border-brand-300/40 focus:border-brand-300',
  ].join(' ')

const underlineSelectClass = (hasError?: boolean) =>
  [
    'w-full px-0 py-2 bg-transparent border-0 border-b text-sm',
    'text-ink focus:ring-0 focus:outline-none transition-colors appearance-none',
    hasError ? 'border-rose-500 focus:border-rose-500' : 'border-brand-300/40 focus:border-brand-300',
  ].join(' ')

export function PatientDialog({
  open,
  onClose,
  mode,
  initialPatient,
  onCreate,
  onUpdate,
}: {
  open: boolean
  onClose: () => void
  mode: Mode
  initialPatient?: FhirPatient
  onCreate?: (p: FhirPatient) => void
  onUpdate?: (p: FhirPatient) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('') // YYYY-MM-DD
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [inviteMode, setInviteMode] = useState<'profileOnly' | 'profileAndInvite'>('profileOnly')
  const [gender, setGender] = useState<'male' | 'female' | 'other' | 'prefer_not_to_say'>(
    'prefer_not_to_say',
  )


  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isEdit = mode === 'edit'

  useEffect(() => {
    if (open && initialPatient && isEdit) {
      const n = initialPatient.name?.[0]
      setFirstName(n?.given?.[0] ?? '')
      setLastName(n?.family ?? '')
      setDob(initialPatient.birthDate ?? '')
      setEmail(initialPatient.telecom?.find(t => t.system === 'email')?.value ?? '')
      setMobile(
        initialPatient.telecom?.find(
          t => t.system === 'phone' && (t.use === 'mobile' || !t.use),
        )?.value ?? '',
      )
      setGender((initialPatient.gender as any) ?? 'prefer_not_to_say')
      setError(null)
    } else if (open && !isEdit) {
      
        setFirstName('')
        setLastName('')
        setDob('')
        setEmail('')
        setMobile('')
        setGender('prefer_not_to_say')
        setInviteMode('profileOnly')
        setError(null)
        setFieldErrors({})
    }
  }, [open, initialPatient, isEdit])

  const form: NewPatientForm = useMemo(
    () => ({
      firstName,
      lastName,
      gender,
      dob,
      email: email || undefined,
      mobile: mobile || undefined,
      inviteMode,
    }),
    [firstName, lastName, gender, dob, email, mobile, inviteMode],
  )

  function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  setError(null)
  setFieldErrors({})  // clear old errors

  const nextFieldErrors: Record<string, string> = {}

  // Required fields
  if (!firstName.trim()) {
    nextFieldErrors.firstName = 'Please enter a first name.'
  }

  if (!lastName.trim()) {
    nextFieldErrors.lastName = 'Please enter a last name.'
  }

  // DOB – if DateField could not produce a valid ISO, dob is empty
  if (!dob) {
    nextFieldErrors.dob = 'Please enter a valid birth date.'
  }

  // Email – optional, but must be valid if filled
  if (!email.trim()) {
    nextFieldErrors.email = 'Please enter an email address'
  }
  if (email.trim()) {
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
    if (!emailRegex.test(email.trim())) {
      nextFieldErrors.email = 'Please enter a valid email address.'
    }
  }

  // Mobile – optional simple check (you can tune this later)
  if (mobile.trim() && mobile.trim().length < 6) {
    nextFieldErrors.mobile = 'Please enter a valid mobile number.'
  }

  if (Object.keys(nextFieldErrors).length > 0) {
    setFieldErrors(nextFieldErrors)
    setError('Please correct the highlighted fields.')
    return // ⛔ don't call Patient.create/update
  }

  // if we reach here, client-side validation passed → go to backend
  try {
    if (isEdit && initialPatient) {
      const updated = Patient.update(initialPatient, form)
      onUpdate?.(updated)
    } else {
      const created = Patient.create(form, { locale: 'de-CH' })
      onCreate?.(created)
    }
    setFieldErrors({})
    setError(null)
    onClose()
    } catch (err: any) {
  // reset previous errors
  setFieldErrors({})
  setError(null)

  let issues: any[] | null = null

  // 1) Direct array
  if (Array.isArray(err)) {
    issues = err
  }

  // 2) Zod-style: { issues: [...] }
  if (!issues && Array.isArray(err?.issues)) {
    issues = err.issues
  }

  // 3) message is a JSON array
  if (!issues && typeof err?.message === 'string') {
    const msg = err.message.trim()
    if (msg.startsWith('[') && msg.endsWith(']')) {
      try {
        const parsed = JSON.parse(msg)
        if (Array.isArray(parsed)) {
          issues = parsed
        }
      } catch {
        // ignore
      }
    }
  }

  if (issues) {
    const nextFieldErrors: Record<string, string> = {}

    for (const issue of issues) {
      const rawPath = Array.isArray(issue.path) ? issue.path[0] : issue.path
      const path = String(rawPath || '')

      switch (path) {
        case 'firstName':
          nextFieldErrors.firstName = 'Please enter a first name.'
          break
        case 'lastName':
          nextFieldErrors.lastName = 'Please enter a last name.'
          break
        case 'birthDate':
        case 'dob':
          nextFieldErrors.dob = 'Please enter a valid birth date.'
          break
        case 'email':
          nextFieldErrors.email = 'Please enter a valid email address.'
          break
        case 'mobile':
          nextFieldErrors.mobile = 'Please enter a valid mobile number.'
          break
        case 'gender':
          nextFieldErrors.gender = 'Please select a gender option.'
          break
        case 'inviteMode':
          nextFieldErrors.inviteMode = 'Please choose an invite option.'
          break
        default:
          // ignore or handle generically
          break
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setError('Please correct the highlighted fields.')
      return
    }

    // fallback: show first issue message
    const first = issues[0]
    setError(
      typeof first?.message === 'string'
        ? first.message
        : 'Please check the form.',
    )
    return
  }

  // Generic fallback
  if (typeof err?.message === 'string') {
    setError(err.message)
  } else {
    setError('Please check the form.')
  }
}



  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-ink">
              {isEdit ? 'Edit patient' : 'New patient'}
            </Dialog.Title>

            <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-5">
              {/* Name row */}
              <div className="grid grid-cols-2 gap-4">
  <div>
    <label className="mb-1 block text-xs text-ink/60">First name</label>
    <input
      value={firstName}
      onChange={e => setFirstName(e.target.value)}
      className={underlineInputClass(!!fieldErrors.firstName)}
    />
    {fieldErrors.firstName && (
      <p className="mt-1 text-xs text-rose-600">{fieldErrors.firstName}</p>
    )}
  </div>

  <div>
    <label className="mb-1 block text-xs text-ink/60">Last name</label>
    <input
      value={lastName}
      onChange={e => setLastName(e.target.value)}
      className={underlineInputClass(!!fieldErrors.lastName)}
    />
    {fieldErrors.lastName && (
      <p className="mt-1 text-xs text-rose-600">{fieldErrors.lastName}</p>
    )}
  </div>
</div>


              {/* Birth date using DateField */}
              <DateField
  label="Birth date"
  name="dob"
  required
  value={dob}
  onChange={setDob}
  helperText="Patient's date of birth."
  error={fieldErrors.dob}
/>

              {/* Gender */}
              <div className='relative'>
                <label className="mb-1 block text-xs text-ink/60">Gender</label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value as any)}
                  className={underlineSelectClass(!!fieldErrors.gender)}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                 <svg
      className="pointer-events-none absolute right-2 top-2/3 h-4 w-4 -translate-y-1/2 text-ink/40 "
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
  <div>
    <label className="mb-1 block text-xs text-ink/60">Email</label>
    <input
      value={email}
      onChange={e => setEmail(e.target.value)}
      className={underlineInputClass(!!fieldErrors.email)}
    />
    {fieldErrors.email && (
      <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>
    )}
  </div>
  <div>
    <label className="mb-1 block text-xs text-ink/60">Mobile (+41…)</label>
    <input
      value={mobile}
      onChange={e => setMobile(e.target.value)}
      className={underlineInputClass(!!fieldErrors.mobile)}
    />
    {fieldErrors.mobile && (
      <p className="mt-1 text-xs text-rose-600">{fieldErrors.mobile}</p>
    )}
  </div>
</div>


              {/* Invite mode only on create */}
              {!isEdit && (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Invite</label>
                  <select
                    value={inviteMode}
                    onChange={e => setInviteMode(e.target.value as any)}
                    className={underlineSelectClass(!!fieldErrors.inviteMode)}
                  >
                    <option value="profileOnly">Create profile only</option>
                    <option value="profileAndInvite">Create + send invite</option>
                  </select>
                </div>
              )}

              {error && (
  <p className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-md p-2">
    {error}
  </p>
)}

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand-700 px-3 py-2 text-sm text-surface hover:bg-brand-600 transition-colors"
                >
                  {isEdit ? 'Save changes' : 'Create patient'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
