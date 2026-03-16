'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Session } from '@/models/session'
import type { Booking } from '@/models/booking'
import { useSnackbar } from '@/components/ui/Snackbar'
import { DateTimeField } from '@/components/ui/DateTimeField'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'

type PatientOption = { id: string; name: string }

type SessionDialogProps = {
  open: boolean
  onClose: () => void

  mode?: 'create' | 'edit'
  session?: Session

  /** For create mode: fixed patient (when opened from Patients / Bookings list) */
  patientId?: string | null
  patientName?: string

  /** For create mode from Sessions page: choose patient */
  patients?: PatientOption[]

  /** All bookings (Sessions page passes this so user can choose one) */
  bookings?: Booking[]

  /**
   * When opening "Create session" from a specific booking row
   * on the Bookings page.
   */
  bookingContext?: {
    id: string
    code: string
    start: string // ISO datetime
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
  const isEdit = mode === 'edit' && !!session

  const [startLocal, setStartLocal] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [techniques, setTechniques] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Booking link state (Sessions-page flow)
  const [linkToBooking, setLinkToBooking] = useState<'yes' | 'no'>('no')
  const [selectedBookingId, setSelectedBookingId] = useState('')

  const canChoosePatient = !patientId && patients && patients.length > 0 && !isEdit

  const patientSelectOptions: SelectOption<string>[] =
    patients?.map(p => ({ value: p.id, label: p.name })) ?? []

  // Which patient is active in this form right now?
  const currentPatientId =
    (isEdit && session ? session.patientId : patientId ?? selectedPatientId) ?? ''

  const bookingsForPatient: Booking[] =
    bookings?.filter(b => b.patientId === currentPatientId) ?? []

  const bookingSelectOptions: SelectOption<string>[] = bookingsForPatient.map(b => ({
    value: b.id,
    label: `${b.code} — ${new Date(b.start).toLocaleString()}`,
  }))

  // initialise form
  useEffect(() => {
    if (!open) return

    setError(null)
    setSubmitting(false)

    if (isEdit && session) {
      const d = new Date(session.startDateTime)
      setStartLocal(toLocalDatetimeInputValue(d))
      setChiefComplaint(session.chiefComplaint)
      setTechniques((session.techniques ?? []).join(', '))

      // Editing existing session: try to restore its booking link if we know about it
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
      // Create mode
      const baseDate = bookingContext
        ? new Date(bookingContext.start)
        : new Date()

      setStartLocal(toLocalDatetimeInputValue(baseDate))
      setChiefComplaint('')
      setTechniques('')
      setLinkToBooking('no')
      setSelectedBookingId('')

      if (!patientId) {
        setSelectedPatientId('')
      }
    }
  }, [open, isEdit, session, patientId, bookings, bookingContext])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const effectivePatientId =
      isEdit && session
        ? session.patientId
        : patientId ?? selectedPatientId

    if (!effectivePatientId) {
      setError('Please choose a patient for this session.')
      return
    }

    let isoStart: string
    // bookingIdToSend:
    //   undefined => don't touch bookingId
    //   string    => set bookingId
    //   null      => explicitly clear bookingId
    let bookingIdToSend: string | null | undefined

    // 1) If coming from a specific booking row (Bookings page create)
    if (bookingContext && !isEdit) {
      isoStart = new Date(bookingContext.start).toISOString()
      bookingIdToSend = bookingContext.id
    } else {
      // 2) Generic Sessions-page flow
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
        // No booking link – manual date/time
        if (!startLocal) {
          setError('Please set a session start time.')
          return
        }
        isoStart = new Date(startLocal).toISOString()

        // If editing and it previously had a booking, clear it
        if (isEdit && session?.bookingId) {
          bookingIdToSend = null
        }
      }
    }

    try {
      setSubmitting(true)
      setError(null)

      const payload: any = {
        startDateTime: isoStart,
        chiefComplaint: chiefComplaint.trim(),
      }

      if (techniques.trim()) {
        payload.techniques = techniques
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      } else {
        payload.techniques = []
      }

      if (bookingIdToSend !== undefined) {
        payload.bookingId = bookingIdToSend
      }

      let endpoint: string
      let method: 'POST' | 'PATCH' = 'POST'

      if (isEdit && session) {
        endpoint = `/api/sessions/${encodeURIComponent(session.id)}`
        method = 'PATCH'
      } else {
        endpoint = `/api/patients/${encodeURIComponent(effectivePatientId)}/sessions`
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
            ? 'Server error while saving session'
            : 'Failed to save session')
        throw new Error(msg)
      }

      const saved: Session = await res.json()

      if (isEdit) {
        onUpdated?.(saved)
        showSnackbar({
          variant: 'success',
          message: 'Session was successfully updated',
        })
      } else {
        onCreated?.(saved)
        const resolvedName =
          patientName ??
          patients?.find(p => p.id === saved.patientId)?.name ??
          'Patient'

        showSnackbar({
          variant: 'success',
          message: `${resolvedName}'s session was successfully created`,
        })
      }

      onClose()
    } catch (err: any) {
      console.error('Failed to save session', err)
      setError(err?.message ?? 'Failed to save session')
      showSnackbar({
        variant: 'error',
        message: 'Could not save session. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    isEdit && session
      ? 'Edit session'
      : patientName
      ? `New session for ${patientName}`
      : 'New session'

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
                  ? 'Update the details of this treatment session.'
                  : 'Record the basic details of this treatment now. You can always add more notes later.'}
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

              {(patientId && patientName) || (isEdit && session) ? (
                <div>
                  <label className="mb-1 block text-xs text-ink/60">
                    Patient
                  </label>
                  <p className="border-0 border-b border-brand-300/40 bg-transparent py-2 text-sm text-ink">
                    {patientName ??
                      patients?.find(p => p.id === session?.patientId)?.name ??
                      'Patient'}
                  </p>
                </div>
              ) : null}

              {/* If coming from a specific booking row (Bookings page),
                  just show info about that booking */}
              {bookingContext ? (
                <div className="mt-2 text-xs text-ink/60">
                  This session will be linked to booking{' '}
                  <span className="font-medium">{bookingContext.code}</span>{' '}
                  on{' '}
                  {new Date(bookingContext.start).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  .
                </div>
              ) : (
                <>
                  {/* Sessions-page booking link logic */}
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-ink/60">
                      Is there a booking for this particular session?
                    </p>

                    {!currentPatientId && (
                      <p className="text-xs text-ink/60">
                        Select a patient first to see their bookings.
                      </p>
                    )}

                    {currentPatientId && (
                      <>
                        <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="linkToBooking"
                              value="no"
                              checked={linkToBooking === 'no'}
                              onChange={() => setLinkToBooking('no')}
                            />
                            <span>No, set date &amp; time manually</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="linkToBooking"
                              value="yes"
                              checked={linkToBooking === 'yes'}
                              onChange={() => {
                                setLinkToBooking('yes')
                                setSelectedBookingId('')
                              }}
                              disabled={bookingsForPatient.length === 0}
                            />
                            <span>
                              Yes, link to a booking
                              {bookingsForPatient.length === 0
                                ? ' (no bookings for this patient yet)'
                                : ''}
                            </span>
                          </label>
                        </div>

                        {linkToBooking === 'yes' && bookingsForPatient.length > 0 && (
                          <div className="mt-2">
                            <SelectField<string>
                              label="Which booking is this session for?"
                              value={selectedBookingId || null}
                              onChange={value => {
                                const id = value ?? ''
                                setSelectedBookingId(id)
                                const chosen = bookingsForPatient.find(b => b.id === id)
                                if (chosen) {
                                  setStartLocal(
                                    toLocalDatetimeInputValue(
                                      new Date(chosen.start),
                                    ),
                                  )
                                }
                              }}
                              options={bookingSelectOptions}
                              placeholder="Select a booking…"
                              required
                            />
                            <p className="mt-1 text-xs text-ink/60">
                              The session date and time will be taken from the booking you
                              choose.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Manual date/time: shown when not tied to a specific booking
                  and either "No" is selected or there are no bookings */}
              {(!bookingContext &&
                (linkToBooking === 'no' || bookingsForPatient.length === 0)) && (
                <DateTimeField
                  label="Session start"
                  name="startDateTime"
                  value={startLocal}
                  onChange={setStartLocal}
                  required
                  helperText="Local date and time of the treatment session."
                />
              )}

              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Chief complaint
                </label>
                <textarea
                  required
                  rows={3}
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="e.g Patient has Chronic Recurring Migraines which last for up to 3 days…"
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-ink/60">
                  Techniques used (optional)
                </label>
                <input
                  type="text"
                  value={techniques}
                  onChange={e => setTechniques(e.target.value)}
                  placeholder="e.g. cupping, acupuncture"
                  className="w-full border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-brand-300 focus:outline-none focus:ring-0"
                />
                <p className="mt-1 text-xs text-ink/60">
                  Enter a comma-separated list. This maps to the{' '}
                  <code>techniques</code> field on the session.
                </p>
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
                  {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create session'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
