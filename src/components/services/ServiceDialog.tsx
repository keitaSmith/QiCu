'use client'

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { FormEvent, useEffect, useState } from 'react'

import type { Service } from '@/models/service'
import { useSnackbar } from '@/components/ui/Snackbar'
import { getErrorMessage } from '@/lib/errors'

type Props = {
  open: boolean
  onClose: () => void
  mode?: 'create' | 'edit'
  service?: Service | null
  onCreated?: (service: Omit<Service, 'id' | 'practitionerId'>) => Promise<void> | void
  onUpdated?: (service: Partial<Service>) => Promise<void> | void
}

export function ServiceDialog({
  open,
  onClose,
  mode = 'create',
  service,
  onCreated,
  onUpdated,
}: Props) {
  const { showSnackbar } = useSnackbar()
  const isEdit = mode === 'edit' && !!service
  const [name, setName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [description, setDescription] = useState('')
  const [active, setActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && service) {
      setName(service.name)
      setDurationMinutes(String(service.durationMinutes))
      setDescription(service.description ?? '')
      setActive(service.active)
    } else {
      setName('')
      setDurationMinutes('60')
      setDescription('')
      setActive(true)
    }
  }, [open, isEdit, service])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const parsedDuration = Number(durationMinutes)

    if (!trimmedName) {
      setError('Please enter a service name.')
      return
    }

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setError('Please enter a valid duration in minutes.')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await onUpdated?.({
          name: trimmedName,
          durationMinutes: parsedDuration,
          description: description.trim() || undefined,
          active,
        })
        showSnackbar({ variant: 'success', message: 'Service updated.' })
      } else {
        await onCreated?.({
          name: trimmedName,
          durationMinutes: parsedDuration,
          description: description.trim() || undefined,
          active,
        })
        showSnackbar({ variant: 'success', message: 'Service created.' })
      }

      onClose()
    } catch (err: unknown) {
      console.error(err)
      const message = getErrorMessage(err, 'Failed to save service.')
      setError(message)
      showSnackbar({ variant: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-40 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">{isEdit ? 'Edit service' : 'New service'}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {isEdit ? 'Update the service details used across bookings and sessions.' : 'Create a service practitioners can use in bookings and sessions.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-ink/60">Service name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Initial consultation"
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Duration (minutes)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(e.target.value)}
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Description (optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional note about when this service is used."
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="h-4 w-4 rounded border-brand-300/50 accent-brand-700 focus:ring-2 focus:ring-brand-600/30 focus:ring-offset-0"
                />
                Service is active and available for new bookings
              </label>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-ink hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-70"
                >
                  {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create service'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
