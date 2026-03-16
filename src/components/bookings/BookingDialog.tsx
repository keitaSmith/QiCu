'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Booking } from '@/models/booking'
import { useSnackbar } from '@/components/ui/Snackbar'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'
import { SERVICES, findServiceById } from '@/data/services'

import { BookingTimePicker } from '@/components/bookings/BookingTimePicker'
import { timeFmt } from '@/lib/dates'

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
  existingBookings: Booking[]
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

function generateBookingCode() {
  return `BKG-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
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
  existingBookings,
}: BookingDialogProps) {
  const { showSnackbar } = useSnackbar()
  const isEdit = mode === 'edit' && !!booking

  const [startLocal, setStartLocal] = useState<string>('')
  const [endLocal, setEndLocal] = useState<string>('')

  const [selectedPatientId, setSelectedPatientId] = useState<string>('')

  const [serviceId, setServiceId] = useState<string>('')
  const [serviceName, setServiceName] = useState<string>('')
  const [serviceDurationMinutes, setServiceDurationMinutes] =
    useState<number | null>(null)

  const [resource, setResource] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canChoosePatient =
    !patientId && patients && patients.length > 0 && !isEdit

  const patientSelectOptions: SelectOption<string>[] =
    patients?.map(p => ({ value: p.id, label: p.name })) ?? []

  const serviceOptions: SelectOption<string>[] = SERVICES.map(s => ({
    value: s.id,
    label: `${s.name} ${s.durationMinutes} min`,
  }))

  // Initialise form when dialog opens or mode changes
  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && booking) {
      setStartLocal(booking.start)
      setEndLocal(booking.end)

      setServiceId(booking.serviceId)
      setServiceName(booking.serviceName)
      setServiceDurationMinutes(booking.serviceDurationMinutes)

      setResource(booking.resource ?? '')
      setNotes(booking.notes ?? '')
    } else {
      setStartLocal('')
      setEndLocal('')

      setServiceId('')
      setServiceName('')
      setServiceDurationMinutes(null)

      setResource('')
      setNotes('')

      if (!patientId) {
        setSelectedPatientId('')
      }
    }
  }, [open, isEdit, booking, patientId])

  // Auto-calc end time when service duration or start time changes
  useEffect(() => {
    if (!serviceDurationMinutes || !startLocal) {
      setEndLocal('')
      return
    }
    const startDate = new Date(startLocal)
    if (Number.isNaN(startDate.getTime())) return

    const endDate = new Date(startDate.getTime() + serviceDurationMinutes * 60_000)
    setEndLocal(toLocalDatetimeInputValue(endDate))
  }, [serviceDurationMinutes, startLocal])

  const title = isEdit ? 'Edit booking' : 'New booking'

  const effectivePatientName =
    patientName ??
    (booking ? patients?.find(p => p.id === booking.patientId)?.name : undefined)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const effectivePatientId =
      isEdit && booking ? booking.patientId : patientId ?? selectedPatientId

    if (!effectivePatientId) {
      setError('Please choose a patient for this booking.')
      return
    }

    if (!serviceId || !serviceName || !serviceDurationMinutes) {
      setError('Please select a service.')
      return
    }

    if (!startLocal) {
      setError('Please choose a start time.')
      return
    }

    if (!endLocal) {
      setError('End time could not be determined.')
      return
    }

    setSubmitting(true)
    try {
      if (isEdit && booking) {
        const updated: Booking = {
          ...booking,
          patientId: effectivePatientId,
          serviceId,
          serviceName,
          serviceDurationMinutes,
          start: startLocal,
          end: endLocal,
          resource: resource || '',
          notes: notes || '',
        }

        onUpdated?.(updated)
        showSnackbar({
          variant: 'success',
          message: 'Booking updated.',
        })
      } else {
        const newBooking: Booking = {
          id: crypto.randomUUID(),
          code: generateBookingCode(),
          patientId: effectivePatientId,
          serviceId,
          serviceName,
          serviceDurationMinutes,
          start: startLocal,
          end: endLocal,
          resource: resource || '',
          status: 'confirmed',
          notes: notes || '',
        }

        onCreated?.(newBooking)
        showSnackbar({
          variant: 'success',
          message: 'Booking created.',
        })
      }

      onClose()
    } catch (err) {
      console.error(err)
      setError('Something went wrong while saving the booking.')
      showSnackbar({
        variant: 'error',
        message: 'Failed to save booking.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />

      {/* This wrapper enables scrolling when viewport is small */}
      <div className="fixed inset-0 z-40 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {isEdit
                  ? 'Update the details of this booking.'
                  : 'Create a new booking for this patient.'}
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

              {!canChoosePatient && (patientId || effectivePatientName) && (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">
                    Patient
                  </label>
                  <p className="border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink">
                    {effectivePatientName ?? 'Patient'}
                  </p>
                </div>
              )}

              {/* Service */}
              <div>
                <SelectField<string>
                  label="Service"
                  value={serviceId || null}
                  onChange={value => {
                    const id = value || ''
                    setServiceId(id)
                    const svc = findServiceById(id)
                    if (svc) {
                      setServiceName(svc.name)
                      setServiceDurationMinutes(svc.durationMinutes)
                    } else {
                      setServiceName('')
                      setServiceDurationMinutes(null)
                    }
                    // reset time when service changes so picker can recompute
                    setStartLocal('')
                    setEndLocal('')
                  }}
                  options={serviceOptions}
                  placeholder="Select a service…"
                  required
                  helperText="Choose which treatment this booking is for."
                />
              </div>

                            {/* Schedule – inline BookingTimePicker */}
              {serviceId && (
                <div>
                  <BookingTimePicker
                    label="Start time"
                    value={startLocal || null}
                    onChange={newValue => setStartLocal(newValue ?? '')}
                    serviceDurationMinutes={serviceDurationMinutes}
                    existingBookings={existingBookings}
                  />
                  {startLocal && serviceDurationMinutes && endLocal && (
                    <p className="mt-1 text-xs text-ink/60">
                      Ends around {timeFmt.format(new Date(endLocal))}
                    </p>
                  )}
                </div>
              )}


              {/* Resource */}
              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Resource (optional)
                </label>
                <input
                  type="text"
                  value={resource}
                  onChange={e => setResource(e.target.value)}
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none"
                  placeholder="Room, practitioner name, etc."
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full min-h-[3rem] border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none resize-y min-h-[3rem]"
                  rows={3}
                  placeholder="Anything relevant for this appointment…"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

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
