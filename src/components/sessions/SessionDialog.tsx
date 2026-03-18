'use client'

import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Session } from '@/models/session'
import type { Booking } from '@/models/booking'
import { useSnackbar } from '@/components/ui/Snackbar'
import { emitSessionsChanged } from '@/lib/session-events'
import { emitBookingsChanged } from '@/lib/booking-events'
import { DateTimeField } from '@/components/ui/DateTimeField'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'
import RadioField from '@/components/ui/RadioField'
import SearchableSelectField, { type SearchableSelectOption } from '@/components/ui/SearchableSelectField'
import { useServices } from '@/hooks/useServices'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { withPractitionerHeaders } from '@/lib/practitioners'

type PatientOption = { id: string; name: string }

type SessionDialogProps = {
  open: boolean
  onClose: () => void
  mode?: 'create' | 'edit'
  session?: Session
  patientId?: string | null
  patientName?: string
  patients?: PatientOption[]
  bookings?: Booking[]
  bookingContext?: {
    id: string
    code: string
    start: string
    serviceId?: string
    serviceName?: string
  }
  onCreated?: (session: Session) => void
  onUpdated?: (session: Session) => void
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

export function SessionDialog({
  open,
  onClose,
  mode = 'create',
  session,
  patientId,
  patientName,
  patients,
  bookings,
  bookingContext,
  onCreated,
  onUpdated,
}: SessionDialogProps) {
  const { showSnackbar } = useSnackbar()
  const { practitionerId } = usePractitioner()
  const { services } = useServices()
  const isEdit = mode === 'edit' && !!session

  const [startLocal, setStartLocal] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [treatmentSummary, setTreatmentSummary] = useState('')
  const [outcome, setOutcome] = useState('')
  const [treatmentNotes, setTreatmentNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [linkToBooking, setLinkToBooking] = useState<'yes' | 'no'>('no')
  const [selectedBookingId, setSelectedBookingId] = useState('')

  const canChoosePatient = !patientId && patients && patients.length > 0 && !isEdit

  const patientSelectOptions: SearchableSelectOption<string>[] =
    patients?.map(p => ({ value: p.id, label: p.name })) ?? []

  const currentPatientId = (isEdit && session ? session.patientId : patientId || selectedPatientId) ?? ''

  const bookingsForPatient: Booking[] =
    bookings?.filter(
      b =>
        b.patientId === currentPatientId &&
        (b.status === 'in-progress' || b.status === 'completed') &&
        (!b.sessionId || b.sessionId === session?.id),
    ) ?? []

  const bookingSelectOptions: SelectOption<string>[] = bookingsForPatient.map(b => ({
    value: b.id,
    label: `${b.code} — ${new Date(b.start).toLocaleString()}`,
  }))

  const serviceOptions: SelectOption<string>[] = useMemo(() => {
    const activeServices = services.filter(service => service.active)
    const currentService = session?.serviceId
      ? services.find(service => service.id === session.serviceId)
      : null

    const uniqueServices = currentService && !activeServices.some(service => service.id === currentService.id)
      ? [currentService, ...activeServices]
      : activeServices

    return uniqueServices.map(service => ({
      value: service.id,
      label: `${service.name} ${service.durationMinutes} min`,
      description: service.active ? undefined : 'Inactive service',
    }))
  }, [services, session?.serviceId])

  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && session) {
      const d = new Date(session.startDateTime)
      setStartLocal(toLocalDatetimeInputValue(d))
      setServiceId(session.serviceId ?? '')
      setChiefComplaint(session.chiefComplaint)
      setTreatmentSummary(session.treatmentSummary ?? '')
      setOutcome(session.outcome ?? '')
      setTreatmentNotes(session.treatmentNotes ?? '')

      if (session.bookingId && bookings && bookings.length > 0) {
        const hasValidBooking = bookings.some(b => b.id === session.bookingId)
        if (hasValidBooking) {
          setLinkToBooking('yes')
          setSelectedBookingId(session.bookingId)
        } else {
          setLinkToBooking('no')
          setSelectedBookingId('')
        }
      } else {
        setLinkToBooking('no')
        setSelectedBookingId('')
      }
    } else {
      const baseDate = bookingContext ? new Date(bookingContext.start) : new Date()
      setStartLocal(toLocalDatetimeInputValue(baseDate))
      setServiceId(bookingContext?.serviceId ?? '')
      setChiefComplaint('')
      setTreatmentSummary('')
      setOutcome('')
      setTreatmentNotes('')
      setLinkToBooking('no')
      setSelectedBookingId('')
      if (!patientId) setSelectedPatientId('')
    }
  }, [open, isEdit, session, patientId, bookings, bookingContext])

  useEffect(() => {
    if (!bookingContext || serviceId) return

    if (bookingContext.serviceId) {
      setServiceId(bookingContext.serviceId)
      return
    }

    if (!bookings) return
    const linkedBooking = bookings.find(booking => booking.id === bookingContext.id)
    if (!linkedBooking?.serviceId) return
    setServiceId(linkedBooking.serviceId)
  }, [bookingContext, bookings, serviceId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const effectivePatientId = isEdit && session ? session.patientId : patientId ?? selectedPatientId

    if (!effectivePatientId) {
      setError('Please choose a patient for this session.')
      return
    }

    if (!serviceId) {
      setError('Please select the service performed.')
      return
    }

    if (!chiefComplaint.trim()) {
      setError('Please enter the reason or chief complaint for this session.')
      return
    }

    let isoStart: string
    let bookingIdToSend: string | null | undefined

    if (bookingContext && !isEdit) {
      isoStart = new Date(bookingContext.start).toISOString()
      bookingIdToSend = bookingContext.id
    } else {
      if (linkToBooking === 'yes') {
        const allBookings = bookings ?? []
        if (!selectedBookingId) {
          setError('Please select which booking this session is for.')
          return
        }
        const chosen = allBookings.find(b => b.id === selectedBookingId)
        if (!chosen) {
          setError('The selected booking could not be found.')
          return
        }
        isoStart = new Date(chosen.start).toISOString()
        bookingIdToSend = chosen.id
      } else {
        if (!startLocal) {
          setError('Please set a session start time.')
          return
        }
        isoStart = new Date(startLocal).toISOString()
        if (isEdit && session?.bookingId) bookingIdToSend = null
      }
    }

    try {
      setSubmitting(true)
      setError(null)

      const payload: Record<string, unknown> = {
        startDateTime: isoStart,
        serviceId,
        chiefComplaint: chiefComplaint.trim(),
        treatmentSummary: treatmentSummary.trim(),
        outcome: outcome.trim(),
        treatmentNotes: treatmentNotes.trim(),
      }

      if (bookingIdToSend !== undefined) payload.bookingId = bookingIdToSend

      const endpoint = isEdit && session
        ? `/api/sessions/${encodeURIComponent(session.id)}`
        : `/api/patients/${encodeURIComponent(effectivePatientId)}/sessions`
      const method: 'POST' | 'PATCH' = isEdit && session ? 'PATCH' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const msg = data?.error || (res.status >= 500 ? 'Server error while saving session' : 'Failed to save session')
        throw new Error(msg)
      }

      const saved: Session = await res.json()

      emitSessionsChanged()
      emitBookingsChanged()

      if (isEdit) {
        onUpdated?.(saved)
        showSnackbar({ variant: 'success', message: 'Session was successfully updated' })
      } else {
        onCreated?.(saved)
        const resolvedName = patientName ?? patients?.find(p => p.id === saved.patientId)?.name ?? 'Patient'
        showSnackbar({ variant: 'success', message: `${resolvedName}'s session was successfully created` })
      }

      onClose()
    } catch (err: any) {
      console.error('Failed to save session', err)
      setError(err?.message ?? 'Failed to save session')
      showSnackbar({ variant: 'error', message: 'Could not save session. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const title = isEdit && session ? 'Edit session' : patientName ? `New session for ${patientName}` : 'New session'

  return (
    <Dialog open={open} onClose={onClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-40 overflow-y-auto p-4 sm:p-6">
        <div className="flex min-h-full items-center justify-center">
          <div className="mx-auto w-full max-w-lg">
            <DialogPanel className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl bg-surface shadow-xl ring-1 ring-black/5 sm:max-h-[calc(100vh-3rem)]">
              <div className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-ink">{title}</h2>
              </div>

              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 sm:px-6">
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

              {(patientId && patientName) || (isEdit && session) ? (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">Patient</label>
                  <p className="border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink">
                    {patientName ?? patients?.find(p => p.id === session?.patientId)?.name ?? 'Patient'}
                  </p>
                </div>
              ) : null}

              {bookingContext ? (
                <div className="mt-2 text-xs text-ink/60">
                  This session will be linked to booking <span className="font-medium">{bookingContext.code}</span> on{' '}
                  {new Date(bookingContext.start).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}.
                </div>
              ) : (
                <div className="mt-2.5 space-y-2">
                  <p className="text-xs text-ink/60">Is there a booking for this particular session?</p>
                  {!currentPatientId && <p className="text-xs text-ink/60">Select a patient first to see their bookings.</p>}

                  {currentPatientId ? (
                    <>
                      <RadioField<'yes' | 'no'>
                        label="Link this session to a booking?"
                        value={linkToBooking}
                        onChange={value => {
                          setLinkToBooking(value)
                          if (value === 'yes') setSelectedBookingId('')
                        }}
                        inline={false}
                        options={
                          bookingsForPatient.length > 0
                            ? [
                                { value: 'no', label: 'No, set date & time manually' },
                                { value: 'yes', label: 'Yes, link to a booking' },
                              ]
                            : [{ value: 'no', label: 'No, set date & time manually' }]
                        }
                        helperText={
                          bookingsForPatient.length > 0
                            ? 'Eligible bookings include in-progress and completed bookings without a linked session.'
                            : 'No eligible in-progress or completed bookings are available for this patient yet.'
                        }
                      />

                      {linkToBooking === 'yes' && bookingsForPatient.length > 0 ? (
                        <div className="mt-2">
                          <SelectField<string>
                            label="Which booking is this session for?"
                            value={selectedBookingId || null}
                            onChange={value => {
                              const id = value ?? ''
                              setSelectedBookingId(id)
                              const chosen = bookingsForPatient.find(b => b.id === id)
                              if (chosen) {
                                setStartLocal(toLocalDatetimeInputValue(new Date(chosen.start)))
                                if (!serviceId) setServiceId(chosen.serviceId)
                              }
                            }}
                            options={bookingSelectOptions}
                            placeholder="Select a booking…"
                            required
                          />
                          <p className="mt-1 text-xs text-ink/60">The session date and time will be taken from the booking you choose.</p>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}

              {!bookingContext && (linkToBooking === 'no' || bookingsForPatient.length === 0) ? (
                <DateTimeField
                  label="Session start"
                  name="startDateTime"
                  value={startLocal}
                  onChange={setStartLocal}
                  required
                  helperText="Local date and time of the treatment session."
                />
              ) : null}

              <SelectField<string>
                label="Service performed"
                value={serviceId || null}
                onChange={value => setServiceId(value)}
                options={serviceOptions}
                placeholder="Select a service…"
                required
              />

              <div>
                <label className="mb-1 block text-xs text-ink/60">Complaint</label>
                <textarea
                  required
                  rows={1}
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="e.g. Lower back pain, stress, follow-up treatment"
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Treatment</label>
                <textarea
                  rows={2}
                  value={treatmentSummary}
                  onChange={e => setTreatmentSummary(e.target.value)}
                  placeholder="e.g. Acupuncture focused on lower back and shoulders."
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Outcome</label>
                <textarea
                  rows={1}
                  value={outcome}
                  onChange={e => setOutcome(e.target.value)}
                  placeholder="e.g. Pain reduced, patient felt relaxed"
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">Notes (optional)</label>
                <textarea
                  rows={1}
                  value={treatmentNotes}
                  onChange={e => setTreatmentNotes(e.target.value)}
                  placeholder="Anything else worth remembering from the session."
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

                  {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>

                <div className="border-t border-slate-200/80 px-5 py-4 sm:px-6">
                  <div className="flex justify-end gap-2">
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
                      {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create session'}
                    </button>
                  </div>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
