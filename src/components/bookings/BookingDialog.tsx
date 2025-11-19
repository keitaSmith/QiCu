'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Booking } from '@/models/booking'
import { useSnackbar } from '@/components/ui/Snackbar'
import { DateTimeField } from '@/components/ui/DateTimeField'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'

type PatientOption = { id: string; name: string }

type BookingDialogProps = {
  open: boolean
  onClose: () => void

  mode?: 'create' | 'edit'
  booking?: Booking

  /** For create mode: fixed patient (when opened from Patients or Bookings list) */
  patientId?: string | null
  patientName?: string

  /** For create mode from Bookings page: choose patient */
  patients?: PatientOption[]

  onCreated?: (booking: Booking) => void
  onUpdated?: (booking: Booking) => void
}

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function BookingDialog({
  open,
  onClose,
  mode = 'create',
  booking,
  patientId,
  patientName,
  patients,
  onCreated,
  onUpdated,
}: BookingDialogProps) {
  const { showSnackbar } = useSnackbar()
  const isEdit = mode === 'edit' && !!booking

  const [startLocal, setStartLocal] = useState('')
  const [endLocal, setEndLocal] = useState('')
  const [service, setService] = useState('')
  const [resource, setResource] = useState('')
  const [notes, setNotes] = useState('')

  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canChoosePatient = !patientId && patients && patients.length > 0 && !isEdit

  const patientSelectOptions: SelectOption<string>[] =
    patients?.map(p => ({ value: p.id, label: p.name })) ?? []

  // initialise form
  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && booking) {
      const startD = new Date(booking.start)
      const endD = new Date(booking.end)

      setStartLocal(toLocalDatetimeInputValue(startD))
      setEndLocal(toLocalDatetimeInputValue(endD))
      setService(booking.service)
      setResource(booking.resource ?? '')
      setNotes(booking.notes ?? '')
      // patient is fixed in edit
    } else {
      const now = new Date()
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)

      setStartLocal(toLocalDatetimeInputValue(now))
      setEndLocal(toLocalDatetimeInputValue(inOneHour))
      setService('')
      setResource('')
      setNotes('')

      if (!patientId) {
        setSelectedPatientId('')
      }
    }
  }, [open, isEdit, booking, patientId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const effectivePatientId =
      isEdit && booking
        ? booking.patientId
        : patientId ?? selectedPatientId

    if (!effectivePatientId) {
      setError('Please choose a patient for this booking.')
      return
    }

    if (!startLocal) {
      setError('Please set a booking start time.')
      return
    }

    if (!endLocal) {
      setError('Please set a booking end time.')
      return
    }

    if (!service.trim()) {
      setError('Please enter a service name.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const isoStart = new Date(startLocal).toISOString()
      const isoEnd = new Date(endLocal).toISOString()

      const payload: any = {
        start: isoStart,
        end: isoEnd,
        service: service.trim(),
        resource: resource.trim() || undefined,
        notes: notes.trim() || undefined,
      }

      let endpoint: string
      let method: 'POST' | 'PATCH' = 'POST'

      if (isEdit && booking) {
        endpoint = `/api/bookings/${encodeURIComponent(booking.id)}`
        method = 'PATCH'
      } else {
        endpoint = `/api/patients/${encodeURIComponent(effectivePatientId)}/bookings`
        method = 'POST'
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
  const data = await res.json().catch(() => null)
  const msg =
    data?.error ||
    (res.status >= 500
      ? 'Server error while saving booking'
      : 'Failed to save booking')

  console.error('Failed to save booking', res.status, data)

  const friendly = msg || 'Failed to save booking'

  setError(friendly)
  showSnackbar({
    variant: 'error',
    message: friendly,
  })

  setSubmitting(false)
  return
}


      const saved: Booking = await res.json()

      if (isEdit) {
        onUpdated?.(saved)
        showSnackbar({
          variant: 'success',
          message: 'Booking was successfully updated',
        })
      } else {
        onCreated?.(saved)

        const resolvedName =
          patientName ??
          patients?.find(p => p.id === saved.patientId)?.name ??
          'Patient'

        showSnackbar({
          variant: 'success',
          message: `New booking created for ${resolvedName}`,
        })
      }

      onClose()
    } catch (err: any) {
      console.error('Failed to save booking', err)
      setError(err?.message ?? 'Failed to save booking')
      showSnackbar({
        variant: 'error',
        message: 'Could not save booking. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    isEdit && booking
      ? 'Edit booking'
      : patientName
      ? `New booking for ${patientName}`
      : 'New booking'

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="mx-auto w-full max-w-lg">
          <DialogPanel className="rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {isEdit
                  ? 'Update the details of this booking.'
                  : 'Schedule a new booking for your patient.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {canChoosePatient && (
                <div>
                  <SelectField<string>
                    label="Patient"
                    value={selectedPatientId || null}
                    onChange={setSelectedPatientId}
                    options={patientSelectOptions}
                    placeholder="Select a patient…"
                    required
                  />
                </div>
              )}

              {(patientId && patientName) || (isEdit && booking) ? (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">
                    Patient
                  </label>
                  <p className="border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink">
                    {patientName ??
                      patients?.find(p => p.id === booking?.patientId)?.name ??
                      'Patient'}
                  </p>
                </div>
              ) : null}

              <DateTimeField
                label="Start time"
                name="start"
                value={startLocal}
                onChange={setStartLocal}
                required
                helperText="Local date and time when the appointment starts."
              />

              <DateTimeField
                label="End time"
                name="end"
                value={endLocal}
                onChange={setEndLocal}
                required
                helperText="Local date and time when the appointment ends."
              />

              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Service
                </label>
                <input
                  type="text"
                  required
                  value={service}
                  onChange={e => setService(e.target.value)}
                  placeholder="e.g. Acupuncture 60m"
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Resource (optional)
                </label>
                <input
                  type="text"
                  value={resource}
                  onChange={e => setResource(e.target.value)}
                  placeholder="e.g. Room 1, Therapist Ana"
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Internal notes about this booking…"
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

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
                  {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create booking'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
