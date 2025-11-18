'use client'

import { useEffect, useState, FormEvent } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

import type { Session } from '@/models/session'
import { useSnackbar } from '@/components/ui/Snackbar'
import { DateTimeField } from '@/components/ui/DateTimeField'

type PatientOption = { id: string; name: string }

type SessionDialogProps = {
  open: boolean
  onClose: () => void

  mode?: 'create' | 'edit'
  session?: Session

  /** For create mode: fixed patient (when opened from Patients or Sessions list) */
  patientId?: string | null
  patientName?: string

  /** For create mode from Sessions page: choose patient */
  patients?: PatientOption[]

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

  const canChoosePatient = !patientId && patients && patients.length > 0 && !isEdit

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
      // patientId is fixed when editing
    } else {
      setStartLocal(toLocalDatetimeInputValue(new Date()))
      setChiefComplaint('')
      setTechniques('')
      if (!patientId) {
        setSelectedPatientId('')
      }
    }
  }, [open, isEdit, session, patientId])

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

    if (!startLocal) {
      setError('Please set a session start time.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const isoStart = new Date(startLocal).toISOString()

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
          (res.status >= 500 ? 'Server error while saving session' : 'Failed to save session')
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
      ? `Edit session`
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
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-ink">Patient</label>
                  <select
                    value={selectedPatientId}
                    onChange={e => setSelectedPatientId(e.target.value)}
                    className="w-full rounded-lg border border-brand-300/60 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">Select a patient…</option>
                    {patients!.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(patientId && patientName) || (isEdit && session) ? (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-ink">Patient</label>
                  <p className="text-sm text-ink/80">
                    {patientName ??
                      patients?.find(p => p.id === session?.patientId)?.name ??
                      'Patient'}
                  </p>
                </div>
              ) : null}

              <DateTimeField
                label="Session start"
                name="startDateTime"
                value={startLocal}
                onChange={setStartLocal}
                required
                helperText="Local date and time of the treatment session."
              />

              <div className="space-y-1">
                <label className="block text-sm font-medium text-ink">Chief complaint</label>
                <textarea
                  required
                  rows={3}
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  className="w-full rounded-lg border border-brand-300/60 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-ink">
                  Techniques used (optional)
                </label>
                <input
                  type="text"
                  value={techniques}
                  onChange={e => setTechniques(e.target.value)}
                  placeholder="e.g. cupping, acupuncture"
                  className="w-full rounded-lg border border-brand-300/60 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p className="text-xs text-ink/60">
                  Enter a comma-separated list. This maps to the <code>techniques</code> field on
                  the session.
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
