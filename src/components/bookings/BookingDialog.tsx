'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Booking } from '@/models/booking'
import { useSnackbar } from '@/components/ui/Snackbar'
import { ErrorDialog } from '@/components/ui/ErrorDialog'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'
import SearchableSelectField, { type SearchableSelectOption } from '@/components/ui/SearchableSelectField'
import { useServices } from '@/hooks/useServices'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { BookingTimePicker } from '@/components/bookings/BookingTimePicker'
import { timeFmt } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'

type PatientOption = { id: string; name: string }

type BookingDialogProps = {
  open: boolean
  onClose: () => void
  mode?: 'create' | 'edit'
  booking?: Booking
  patientId?: string | null
  patientName?: string
  patients?: PatientOption[]
  onCreated?: (booking: Booking) => void | Promise<void>
  onUpdated?: (booking: Booking) => void | Promise<void>
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

const BOOKING_OVERLAP_ERROR = 'Booking overlaps an existing booking'

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
  const { practitionerId } = usePractitioner()
  const { services } = useServices()
  const isEdit = mode === 'edit' && !!booking

  const [startLocal, setStartLocal] = useState<string>('')
  const [endLocal, setEndLocal] = useState<string>('')
  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [serviceId, setServiceId] = useState<string>('')
  const [serviceName, setServiceName] = useState<string>('')
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState<number | null>(null)
  const [resource, setResource] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)

  const canChoosePatient = !patientId && patients && patients.length > 0 && !isEdit

  const patientSelectOptions: SearchableSelectOption<string>[] =
    patients?.map(p => ({ value: p.id, label: p.name })) ?? []

  const serviceOptions: SelectOption<string>[] = useMemo(() => {
    const activeServices = services.filter(service => service.active)
    const currentService = booking?.serviceId
      ? services.find(service => service.id === booking.serviceId)
      : null

    const uniqueServices = currentService && !activeServices.some(service => service.id === currentService.id)
      ? [currentService, ...activeServices]
      : activeServices

    return uniqueServices.map(service => ({
      value: service.id,
      label: `${service.name} ${service.durationMinutes} min`,
      description: service.active ? undefined : 'Inactive service',
    }))
  }, [services, booking?.serviceId])

  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)
    setConflictDialogOpen(false)

    if (isEdit && booking) {
      setStartLocal(toLocalDatetimeInputValue(new Date(booking.start)))
      setEndLocal(toLocalDatetimeInputValue(new Date(booking.end)))
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
      if (!patientId) setSelectedPatientId('')
    }
  }, [open, isEdit, booking, patientId])

  useEffect(() => {
    if (!serviceId) {
      setServiceName('')
      setServiceDurationMinutes(null)
      return
    }

    const selected = services.find(service => service.id === serviceId)
    if (!selected) return
    setServiceName(selected.name)
    setServiceDurationMinutes(selected.durationMinutes)
  }, [serviceId, services])

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
    patientName ?? (booking ? patients?.find(p => p.id === booking.patientId)?.name : undefined)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setConflictDialogOpen(false)

    const effectivePatientId = isEdit && booking ? booking.patientId : patientId ?? selectedPatientId

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
          start: new Date(startLocal).toISOString(),
          end: new Date(endLocal).toISOString(),
          resource: resource || '',
          notes: notes || '',
        }

        await onUpdated?.(updated)
        showSnackbar({ variant: 'success', message: 'Booking updated.' })
      } else {
        const newBooking: Booking = {
          id: crypto.randomUUID(),
          code: generateBookingCode(),
          practitionerId,
          patientId: effectivePatientId,
          serviceId,
          serviceName,
          serviceDurationMinutes,
          start: new Date(startLocal).toISOString(),
          end: new Date(endLocal).toISOString(),
          resource: resource || '',
          status: 'confirmed',
          notes: notes || '',
        }

        await onCreated?.(newBooking)
        showSnackbar({ variant: 'success', message: 'Booking created.' })
      }

      onClose()
    } catch (err: unknown) {
      console.error(err)
      const message = getErrorMessage(err, 'Something went wrong while saving the booking.')
      if (message === BOOKING_OVERLAP_ERROR) {
        setConflictDialogOpen(true)
      } else {
        setError(message)
        showSnackbar({ variant: 'error', message: 'Failed to save booking.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-40 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {isEdit ? 'Update the details of this booking.' : 'Create a new booking for this patient.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {canChoosePatient && (
                <SearchableSelectField<string>
                  label="Patient"
                  value={selectedPatientId || null}
                  onChange={setSelectedPatientId}
                  options={patientSelectOptions}
                  placeholder="Select a patient…"
                  searchPlaceholder="Type a patient name…"
                  noResultsText="No patients match that search."
                  required
                />
              )}

              {!canChoosePatient && (patientId || effectivePatientName) && (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Patient</label>
                  <p className="border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink">
                    {effectivePatientName ?? 'Patient'}
                  </p>
                </div>
              )}

              <SelectField<string>
                label="Service"
                value={serviceId || null}
                onChange={value => {
                  const nextServiceId = value ?? ''
                  setServiceId(nextServiceId)
                  setStartLocal('')
                  setEndLocal('')
                }}
                options={serviceOptions}
                placeholder="Select a service…"
                required
              />

              {serviceId && (
                <div>
                  <BookingTimePicker
                    label="Start time"
                    value={startLocal || null}
                    onChange={newValue => setStartLocal(newValue ?? '')}
                    serviceDurationMinutes={serviceDurationMinutes}
                    existingBookings={existingBookings.filter(existingBooking => !booking || existingBooking.id !== booking.id)}
                  />
                  {startLocal && serviceDurationMinutes && endLocal && (
                    <p className="mt-1 text-xs text-ink/60">
                      Ends around {timeFmt.format(new Date(endLocal))}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-ink/60">Resource (optional)</label>
                <input
                  type="text"
                  value={resource}
                  onChange={e => setResource(e.target.value)}
                  placeholder="e.g. Room 1"
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Notes (optional)</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional note about this booking."
                  className="w-full border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
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
      <ErrorDialog
        open={conflictDialogOpen}
        onClose={() => setConflictDialogOpen(false)}
        title="Scheduling Conflict"
        message="This time slot is already booked. Please choose another time."
      />
    </>
  )
}
