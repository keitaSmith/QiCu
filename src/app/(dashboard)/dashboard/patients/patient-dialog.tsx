'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'
import type { NewPatientForm } from '@/lib/fhir/patient-builders'

type Mode = 'create' | 'edit'

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
  const [error, setError] = useState<string | null>(null)

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
          t => t.system === 'phone' && (t.use === 'mobile' || !t.use)
        )?.value ?? ''
      )
      setError(null)
    } else if (open && !isEdit) {
      setFirstName('')
      setLastName('')
      setDob('')
      setEmail('')
      setMobile('')
      setInviteMode('profileOnly')
      setError(null)
    }
  }, [open, isEdit, initialPatient])

  const form: NewPatientForm = useMemo(
    () => ({
      firstName,
      lastName,
      dob,
      email: email || undefined,
      mobile: mobile || undefined,
      inviteMode,
    }),
    [firstName, lastName, dob, email, mobile, inviteMode]
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isEdit && initialPatient) {
        const updated = Patient.update(initialPatient, form)
        onUpdate?.(updated)
      } else {
        const created = Patient.create(form, { locale: 'de-CH' })
        onCreate?.(created)
      }
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Please check the form.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-ink">
              {isEdit ? 'Edit patient' : 'New patient'}
            </Dialog.Title>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-ink/60">First name</label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Last name</label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Birth date (YYYY-MM-DD)</label>
                <input
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                  placeholder="1990-05-24"
                  required
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Email</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Mobile (+41…)</label>
                  <input
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              {!isEdit && (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Invite</label>
                  <select
                    value={inviteMode}
                    onChange={e => setInviteMode(e.target.value as any)}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  >
                    <option value="profileOnly">Create profile only</option>
                    <option value="profileAndInvite">Create + send invite</option>
                  </select>
                </div>
              )}

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600"
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
