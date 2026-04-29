'use client'

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'

import type { PatientCoreView } from '@/models/patient.coreView'
import type { Service } from '@/models/service'
import {
  buildBookingImportPreview,
  buildBookingsTemplateCsv,
  parseBookingsCsv,
  type BookingImportPreviewRow,
} from '@/lib/bookingsImportExport'
import type {
  GoogleBookingImportPreviewRow,
  GoogleCalendarOption,
  GoogleImportClassification,
  GoogleImportConfidence,
  GoogleImportMode,
} from '@/lib/google/types'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { DateField } from '@/components/ui/DateField'
import { LongCardSkeleton } from '@/components/ui/LongCardSkeleton'
import SelectField, { type SelectOption } from '@/components/ui/SelectField'
import SearchableSelectField, { type SearchableSelectOption } from '@/components/ui/SearchableSelectField'
import { withPractitionerHeaders } from '@/lib/practitioners'

type GoogleStatus = {
  connected: boolean
  googleUserEmail?: string
  selectedCalendarId?: string
  selectedCalendarName?: string
  canConnect: boolean
  lastError?: string | null
}

const GOOGLE_IMPORT_MODE_OPTIONS: Array<{ value: GoogleImportMode; label: string; hint: string }> = [
  {
    value: 'appointments-only',
    label: 'Appointments only',
    hint: 'Show only likely bookings.',
  },
  {
    value: 'timed-events',
    label: 'All timed events',
    hint: 'Include blocked time and other timed events.',
  },
  {
    value: 'review-everything',
    label: 'Review everything',
    hint: 'Show everything in the range.',
  },
]

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

type BookingImportDialogProps = {
  open: boolean
  onClose: () => void
  patients: PatientCoreView[]
  services: Service[]
  onImportRows: (rows: BookingImportPreviewRow[]) => Promise<void>
}

type SourceTab = 'csv' | 'google'

function defaultGoogleRange() {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + 90)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

function badgeClassesForClassification(classification: GoogleImportClassification | undefined) {
  switch (classification) {
    case 'booking-candidate':
      return 'bg-emerald-100 text-emerald-800'
    case 'blocked-time-candidate':
      return 'bg-brand-100 text-brand-800'
    case 'ignore':
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function labelForClassification(classification: GoogleImportClassification | undefined) {
  switch (classification) {
    case 'booking-candidate':
      return 'Candidate'
    case 'blocked-time-candidate':
      return 'Blocked time'
    case 'ignore':
    default:
      return 'Ignore'
  }
}

function badgeClassesForConfidence(confidence: GoogleImportConfidence | undefined) {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-100 text-emerald-800'
    case 'review':
      return 'bg-amber-100 text-amber-800'
    case 'not-suitable':
    default:
      return 'bg-rose-100 text-rose-800'
  }
}

function labelForConfidence(confidence: GoogleImportConfidence | undefined) {
  switch (confidence) {
    case 'high':
      return 'High'
    case 'review':
      return 'Review'
    case 'not-suitable':
    default:
      return 'Skip'
  }
}

function normalizeMessages(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function editorKey(kind: 'patient' | 'service', eventId: string) {
  return `${kind}:${eventId}`
}

export function BookingImportDialog({
  open,
  onClose,
  patients,
  services,
  onImportRows,
}: BookingImportDialogProps) {
  const { practitionerId } = usePractitioner()
  const [sourceTab, setSourceTab] = useState<SourceTab>('csv')
  const [fileName, setFileName] = useState('')
  const [previewRows, setPreviewRows] = useState<BookingImportPreviewRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null)
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>([])
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleInitializing, setGoogleInitializing] = useState(false)
  const [googleRange, setGoogleRange] = useState(defaultGoogleRange)
  const [googleImportMode, setGoogleImportMode] = useState<GoogleImportMode>('appointments-only')
  const [googleSelectedCalendarId, setGoogleSelectedCalendarId] = useState('')
  const [googleSelectedEventIds, setGoogleSelectedEventIds] = useState<string[]>([])
  const [activeEditor, setActiveEditor] = useState<string | null>(null)

  const patientOptions = useMemo<SearchableSelectOption<string>[]>(
    () => patients.map(patient => ({ value: patient.id ?? '', label: patient.name })),
    [patients],
  )

  const serviceOptions = useMemo<SelectOption<string>[]>(
    () =>
      services.map(service => ({
        value: service.id ?? '',
        label: service.name,
        description: service.active ? `${service.durationMinutes} min` : `${service.durationMinutes} min • Inactive`,
      })),
    [services],
  )

  const patientNameById = useMemo(
    () => new Map(patientOptions.map(option => [option.value, option.label])),
    [patientOptions],
  )

  const serviceById = useMemo(
    () => new Map(services.map(service => [service.id ?? '', service])),
    [services],
  )

  const serviceOptionById = useMemo(
    () => new Map(serviceOptions.map(option => [option.value, option])),
    [serviceOptions],
  )

  const googleCalendarSelectOptions = useMemo<SelectOption<string>[]>(
    () =>
      googleCalendars.map(calendar => ({
        value: calendar.id,
        label: `${calendar.summary}${calendar.primary ? ' (Primary)' : ''}`,
        description: calendar.accessRole ? calendar.accessRole.replace(/_/g, ' ') : undefined,
      })),
    [googleCalendars],
  )

  const googleModeSelectOptions = useMemo<SelectOption<GoogleImportMode>[]>(
    () =>
      GOOGLE_IMPORT_MODE_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
        description: option.hint,
      })),
    [],
  )

  const isGooglePreview = useMemo(
    () => previewRows.some(row => row.externalSource === 'google'),
    [previewRows],
  )

  function isGoogleRowReady(row: BookingImportPreviewRow) {
    if (row.externalSource !== 'google') return row.isValid
    if (row.errors.length > 0) return false
    if (row.importClassification === 'ignore') return false
    if (!row.matchedPatientId) return false
    if (!row.matchedServiceId) return false
    return true
  }

  function getGoogleRowMessages(row: BookingImportPreviewRow) {
    const messages = [...(row.reviewReasons ?? [])]

    if (row.externalSource === 'google') {
      if (!row.matchedPatientId) messages.push('Assign patient')
      if (!row.matchedServiceId) messages.push('Assign service')
      if (row.importClassification === 'blocked-time-candidate' && !row.matchedPatientId) {
        messages.push('Blocked time unless reassigned')
      }
      if (row.duplicateStatus === 'possible') {
        messages.push('Possible duplicate')
      }
    }

    return normalizeMessages(messages)
  }

  function isSuggestedGoogleSelection(row: BookingImportPreviewRow) {
    return (
      row.externalSource === 'google' &&
      row.errors.length === 0 &&
      row.importClassification === 'booking-candidate' &&
      row.importConfidence === 'high' &&
      row.duplicateStatus === 'none' &&
      Boolean(row.matchedPatientId) &&
      Boolean(row.matchedServiceId) &&
      Boolean(row.externalEventId)
    )
  }

  const selectedGoogleRows = useMemo(
    () =>
      previewRows.filter(
        row =>
          row.externalSource === 'google' &&
          row.externalEventId &&
          googleSelectedEventIds.includes(row.externalEventId),
      ),
    [googleSelectedEventIds, previewRows],
  )

  const validRows = useMemo(() => {
    if (!isGooglePreview) {
      return previewRows.filter(row => row.isValid)
    }

    return selectedGoogleRows.filter(isGoogleRowReady)
  }, [isGooglePreview, previewRows, selectedGoogleRows])

  const invalidRows = useMemo(
    () => previewRows.filter(row => !row.isValid),
    [previewRows],
  )

  const googleReviewCount = useMemo(() => {
    if (!isGooglePreview) return 0
    return selectedGoogleRows.filter(row => !isGoogleRowReady(row) && row.errors.length === 0).length
  }, [isGooglePreview, selectedGoogleRows])

  async function loadGoogleStatus() {
    const res = await fetch('/api/integrations/google/status', {
      cache: 'no-store',
      headers: withPractitionerHeaders(practitionerId),
    })

    const data = (await res.json()) as GoogleStatus & { error?: string }
    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to load Google Calendar status')
    }

    setGoogleStatus(data)
    setGoogleSelectedCalendarId(data.selectedCalendarId ?? '')
    return data
  }

  async function loadGoogleCalendars() {
    const res = await fetch('/api/integrations/google/calendars', {
      cache: 'no-store',
      headers: withPractitionerHeaders(practitionerId),
    })

    const data = (await res.json()) as { calendars?: GoogleCalendarOption[]; error?: string }
    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to load Google calendars')
    }

    const calendars = data.calendars ?? []
    setGoogleCalendars(calendars)
    setGoogleSelectedCalendarId(prev => prev || calendars[0]?.id || '')
    return calendars
  }

  useEffect(() => {
    if (!open || sourceTab !== 'google') return

    let cancelled = false

    async function initGoogle() {
      try {
        if (!cancelled) {
          setGoogleInitializing(true)
          setError(null)
        }

        const status = await loadGoogleStatus()
        if (!cancelled && status.connected) {
          await loadGoogleCalendars()
        }
      } catch (nextError: any) {
        if (!cancelled) {
          setError(nextError?.message ?? 'Failed to initialize Google Calendar import')
        }
      } finally {
        if (!cancelled) {
          setGoogleInitializing(false)
        }
      }
    }

    void initGoogle()

    return () => {
      cancelled = true
    }
  }, [open, practitionerId, sourceTab])

  function resetState() {
    setSourceTab('csv')
    setFileName('')
    setPreviewRows([])
    setError(null)
    setSubmitting(false)
    setGoogleCalendars([])
    setGoogleLoading(false)
    setGoogleInitializing(false)
    setGoogleStatus(null)
    setGoogleRange(defaultGoogleRange())
    setGoogleImportMode('appointments-only')
    setGoogleSelectedCalendarId('')
    setGoogleSelectedEventIds([])
    setActiveEditor(null)
  }

  function handleClose() {
    resetState()
    onClose()
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError(null)
    setGoogleSelectedEventIds([])

    try {
      const text = await file.text()
      const parsed = parseBookingsCsv(text)

      if (parsed.length === 0) {
        setPreviewRows([])
        setError('The file is empty or could not be read as CSV.')
        return
      }

      const preview = buildBookingImportPreview(parsed, patients, services)
      setPreviewRows(preview)
    } catch (nextError) {
      console.error(nextError)
      setPreviewRows([])
      setError('Could not read that file. Please upload a CSV file.')
    }
  }

  async function handleImport() {
    if (validRows.length === 0) return

    setSubmitting(true)
    setError(null)

    try {
      await onImportRows(validRows)
      handleClose()
    } catch (nextError) {
      console.error(nextError)
      setError('Something went wrong while importing bookings.')
      setSubmitting(false)
    }
  }

  async function handleGoogleConnect() {
    try {
      setGoogleLoading(true)
      setError(null)

      const res = await fetch('/api/integrations/google/auth-url', {
        headers: withPractitionerHeaders(practitionerId),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Could not start Google Calendar connection')
      }

      const popup = window.open(data.url, 'qicu-google-oauth', 'width=540,height=720')
      if (!popup) {
        throw new Error('Your browser blocked the Google sign-in popup.')
      }

      await new Promise<void>((resolve, reject) => {
        const started = Date.now()

        const listener = (event: MessageEvent) => {
          if (event.data?.type === 'qicu-google-oauth') {
            window.removeEventListener('message', listener)
            if (event.data?.success) {
              resolve()
            } else {
              reject(new Error('Google sign-in was cancelled or failed.'))
            }
          }
        }

        window.addEventListener('message', listener)

        const interval = window.setInterval(async () => {
          if (popup.closed) {
            window.clearInterval(interval)
            window.removeEventListener('message', listener)
            try {
              const status = await loadGoogleStatus()
              if (status.connected) {
                resolve()
              } else {
                reject(new Error('Google sign-in window closed before connection finished.'))
              }
            } catch (nextError) {
              reject(nextError)
            }
            return
          }

          if (Date.now() - started > 120_000) {
            window.clearInterval(interval)
            window.removeEventListener('message', listener)
            popup.close()
            reject(new Error('Google sign-in timed out. Please try again.'))
          }
        }, 1000)
      })

      await loadGoogleStatus()
      await loadGoogleCalendars()
    } catch (nextError: any) {
      setError(nextError?.message ?? 'Could not connect Google Calendar')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleDisconnectGoogle() {
    try {
      setGoogleLoading(true)
      setError(null)

      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: withPractitionerHeaders(practitionerId),
      })
      if (!res.ok) {
        throw new Error('Failed to disconnect Google Calendar')
      }

      setGoogleStatus({ connected: false, canConnect: true })
      setGoogleCalendars([])
      setGoogleSelectedCalendarId('')
      setPreviewRows([])
      setGoogleSelectedEventIds([])
      setActiveEditor(null)
    } catch (nextError: any) {
      setError(nextError?.message ?? 'Failed to disconnect Google Calendar')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleGoogleCalendarSelection(calendarId: string) {
    setGoogleSelectedCalendarId(calendarId)

    const calendar = googleCalendars.find(item => item.id === calendarId)

    const res = await fetch('/api/integrations/google/calendar-selection', {
      method: 'POST',
      headers: withPractitionerHeaders(practitionerId, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        calendarId,
        calendarName: calendar?.summary,
      }),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.error ?? 'Failed to save Google calendar selection')
    }

    setGoogleStatus(prev =>
      prev
        ? {
            ...prev,
            selectedCalendarId: calendarId,
            selectedCalendarName: calendar?.summary,
          }
        : prev,
    )
  }

  async function handleGooglePreview() {
    try {
      setGoogleLoading(true)
      setError(null)
      setActiveEditor(null)

      if (!googleSelectedCalendarId) {
        throw new Error('Choose a Google calendar first.')
      }

      await handleGoogleCalendarSelection(googleSelectedCalendarId)

      const fromIso = new Date(`${googleRange.from}T00:00:00`).toISOString()
      const toIso = new Date(`${googleRange.to}T23:59:59`).toISOString()
      const query = new URLSearchParams({
        from: fromIso,
        to: toIso,
        mode: googleImportMode,
      })

      const res = await fetch(`/api/integrations/google/events-preview?${query.toString()}`, {
        cache: 'no-store',
        headers: withPractitionerHeaders(practitionerId),
      })

      const data = (await res.json()) as { rows?: GoogleBookingImportPreviewRow[]; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to preview Google events')
      }

      const rows = (data.rows ?? []).map(row => ({ ...row }))
      setPreviewRows(rows)
      setGoogleSelectedEventIds(
        rows.filter(isSuggestedGoogleSelection).map(row => row.externalEventId!),
      )
    } catch (nextError: any) {
      setError(nextError?.message ?? 'Failed to preview Google events')
      setPreviewRows([])
      setGoogleSelectedEventIds([])
    } finally {
      setGoogleLoading(false)
    }
  }

  function toggleGoogleEventSelection(eventId: string) {
    setGoogleSelectedEventIds(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId],
    )
  }

  function selectAllGoogleEvents() {
    setGoogleSelectedEventIds(
      previewRows
        .filter(row => row.externalSource === 'google' && row.errors.length === 0 && row.externalEventId)
        .map(row => row.externalEventId!),
    )
  }

  function clearAllGoogleEvents() {
    setGoogleSelectedEventIds([])
  }

  function updateGoogleRow(
    eventId: string,
    updater: (row: BookingImportPreviewRow) => BookingImportPreviewRow,
  ) {
    setPreviewRows(prev =>
      prev.map(row => {
        if (row.externalSource !== 'google' || row.externalEventId !== eventId) return row
        const next = updater(row)
        const nextClassification =
          next.importClassification === 'ignore'
            ? 'ignore'
            : next.matchedPatientId && next.matchedServiceId
              ? 'booking-candidate'
              : next.importClassification ?? 'booking-candidate'

        const nextConfidence =
          next.importClassification === 'ignore'
            ? 'not-suitable'
            : next.errors.length > 0
              ? 'not-suitable'
              : next.matchedPatientId && next.matchedServiceId && next.duplicateStatus !== 'possible'
                ? 'high'
                : 'review'

        return {
          ...next,
          willCreatePatient: false,
          willCreateService: false,
          importClassification: nextClassification,
          importConfidence: nextConfidence,
        }
      }),
    )
  }

  function handleGooglePatientAssignment(eventId: string, patientId: string) {
    updateGoogleRow(eventId, row => ({
      ...row,
      matchedPatientId: patientId || undefined,
      patientName: patientId ? patientNameById.get(patientId) ?? row.patientName : '',
    }))
  }

  function handleGoogleServiceAssignment(eventId: string, serviceId: string) {
    updateGoogleRow(eventId, row => ({
      ...row,
      matchedServiceId: serviceId || undefined,
      serviceName: serviceId ? serviceById.get(serviceId)?.name ?? row.serviceName : '',
    }))
  }

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-40">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-40 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-6xl rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Import bookings</h2>
                <p className="mt-1 text-sm text-ink/70">
                  Import from CSV or review Google Calendar events before adding them to QiCu.
                </p>
              </div>

              <button
                type="button"
                onClick={() => downloadCsv('qicu-bookings-template.csv', buildBookingsTemplateCsv())}
                className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Download CSV template
              </button>
            </div>

            <div className="mb-4 inline-flex rounded-2xl border border-brand-300/30 bg-canvas/40 p-1">
              {([
                { value: 'csv', label: 'CSV import' },
                { value: 'google', label: 'Google Calendar' },
              ] as const).map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setSourceTab(tab.value)
                    setPreviewRows([])
                    setGoogleSelectedEventIds([])
                    setActiveEditor(null)
                    setError(null)
                  }}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    sourceTab === tab.value
                      ? 'bg-brand-700 text-white shadow-sm'
                      : 'text-ink hover:bg-brand-300/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {sourceTab === 'csv' ? (
                <div className="rounded-xl border border-brand-300/30 bg-brand-50/40 p-4">
                  <label className="block text-sm font-medium text-ink">CSV file</label>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="mt-2 block w-full rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600"
                  />
                  {fileName && <p className="mt-2 text-xs text-ink/60">Loaded file: {fileName}</p>}
                </div>
              ) : googleInitializing ? (
                <LongCardSkeleton sections={2} />
              ) : (
                <div className="space-y-4 rounded-xl border border-brand-300/30 bg-brand-50/40 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink">Google account</div>
                      <div className="mt-1 text-sm text-ink/70">
                        {googleStatus?.connected
                          ? `Connected as ${googleStatus.googleUserEmail ?? 'Google account'}`
                          : 'Connect a Google account to preview calendar events.'}
                      </div>
                      {!googleStatus?.canConnect && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your local env before testing the real Google flow.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!googleStatus?.connected ? (
                        <button
                          type="button"
                          onClick={() => void handleGoogleConnect()}
                          disabled={googleLoading}
                          className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                        >
                          {googleLoading ? 'Connecting…' : 'Connect Google'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void loadGoogleCalendars()}
                            disabled={googleLoading}
                            className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
                          >
                            Refresh calendars
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDisconnectGoogle()}
                            disabled={googleLoading}
                            className="rounded-lg border border-rose-300/40 bg-surface px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-5 lg:items-end">
                    <div className="lg:col-span-2">
                      <SelectField<string>
                        label="Calendar"
                        value={googleSelectedCalendarId || null}
                        onChange={value => void handleGoogleCalendarSelection(value)}
                        options={googleCalendarSelectOptions}
                        placeholder="Select calendar"
                        disabled={!googleStatus?.connected || googleLoading || googleCalendars.length === 0}
                        menuClassName="w-full"
                      />
                    </div>

                    <div>
                      <SelectField<GoogleImportMode>
                        label="Mode"
                        value={googleImportMode}
                        onChange={value => setGoogleImportMode(value)}
                        options={googleModeSelectOptions}
                        disabled={googleLoading}
                        descriptionDisplay="tooltip"
                        menuClassName="w-full"
                      />
                    </div>

                    <div>
                      <DateField
                        label="From"
                        value={googleRange.from}
                        onChange={value => setGoogleRange(prev => ({ ...prev, from: value }))}
                        allowFuture
                        minYear={2020}
                        maxYear={new Date().getFullYear() + 5}
                      />
                    </div>

                    <div>
                      <DateField
                        label="To"
                        value={googleRange.to}
                        onChange={value => setGoogleRange(prev => ({ ...prev, to: value }))}
                        allowFuture
                        minYear={2020}
                        maxYear={new Date().getFullYear() + 5}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleGooglePreview()}
                      disabled={!googleStatus?.connected || googleLoading || !googleSelectedCalendarId}
                      className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
                    >
                      {googleLoading ? 'Loading…' : 'Preview Google events'}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {previewRows.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-brand-300/30 bg-surface p-3">
                      <div className="text-xs uppercase tracking-wide text-ink/60">Rows found</div>
                      <div className="mt-1 text-lg font-semibold text-ink">{previewRows.length}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-emerald-700">
                        {isGooglePreview ? 'Selected & ready' : 'Ready to import'}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-emerald-800">{validRows.length}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <div className="text-xs uppercase tracking-wide text-amber-700">
                        {isGooglePreview ? 'Selected & needs review' : 'Needs fixing'}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-amber-800">
                        {isGooglePreview ? googleReviewCount : invalidRows.length}
                      </div>
                    </div>
                  </div>

                  {isGooglePreview && (
                    <div className="flex flex-col gap-3 rounded-xl border border-brand-300/30 bg-brand-50/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-ink/70">
                        High-confidence rows are preselected. Review rows need a matched patient and service before import.
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={selectAllGoogleEvents}
                          className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
                        >
                          Select all shown
                        </button>
                        <button
                          type="button"
                          onClick={clearAllGoogleEvents}
                          className="rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
                        >
                          Clear selection
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-[30rem] overflow-y-auto rounded-xl border border-brand-300/30">
                    <table className="min-w-full table-fixed divide-y divide-brand-300/20 text-sm">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="text-left text-ink/70">
                          {isGooglePreview && <th className="px-3 py-2 font-medium">Import</th>}
                          <th className="w-[22%] px-3 py-2 font-medium">Patient</th>
                          <th className="w-[28%] px-3 py-2 font-medium">Service</th>
                          <th className="w-[17%] px-3 py-2 font-medium">Start</th>
                          <th className="w-[15%] px-3 py-2 font-medium">Assessment</th>
                          <th className="w-[18%] px-3 py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-300/10 bg-white/60">
                        {previewRows.map(row => {
                          const googleEventId = row.externalEventId ?? ''
                          const isSelected = Boolean(
                            row.externalSource === 'google' &&
                              googleEventId &&
                              googleSelectedEventIds.includes(googleEventId),
                          )
                          const rowReady = isGoogleRowReady(row)
                          const rowMessages = row.externalSource === 'google' ? getGoogleRowMessages(row) : []
                          const eventTitle = row.externalSource === 'google' ? row.sourceSummary?.trim() ?? '' : ''
                          const metaSlot = row.externalSource === 'google'
                            ? eventTitle || 'Google event'
                            : ' '

                          return (
                            <tr
                              key={`${row.rowNumber}-${row.sourceSummary ?? row.patientName}-${row.start}`}
                              className={!rowReady && row.externalSource === 'google' ? 'bg-amber-50/20' : ''}
                            >
                              {isGooglePreview && (
                                <td className="px-3 py-2 align-top">
                                  {row.externalSource === 'google' ? (
                                    <label className="inline-flex items-center rounded-lg px-2 py-1 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={row.importClassification === 'ignore'}
                                        onChange={() => toggleGoogleEventSelection(googleEventId)}
                                        className="h-4 w-4 rounded border-brand-300/50 accent-brand-700 focus:ring-2 focus:ring-brand-600/30 focus:ring-offset-0 disabled:cursor-not-allowed"
                                      />
                                    </label>
                                  ) : (
                                    <span className="text-xs text-ink/40">—</span>
                                  )}
                                </td>
                              )}

                              <td className="px-3 py-2 align-top">
                                <div className="space-y-2">
                                  <div className="min-h-[1rem] truncate text-xs text-ink/45" title={eventTitle || undefined}>
                                    {metaSlot}
                                  </div>
                                  {row.externalSource === 'google' ? (
                                    <div>
                                      {activeEditor === editorKey('patient', googleEventId) ? (
                                        <SearchableSelectField<string>
                                          value={row.matchedPatientId ?? null}
                                          onChange={value => {
                                            handleGooglePatientAssignment(googleEventId, value)
                                            setActiveEditor(null)
                                          }}
                                          options={patientOptions}
                                          placeholder="Assign patient"
                                          searchPlaceholder="Search patient…"
                                          noResultsText="No matching patients found."
                                          initialVisibleCount={8}
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setActiveEditor(editorKey('patient', googleEventId))}
                                          className="w-full truncate border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-left text-sm text-ink transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none"
                                        >
                                          {row.matchedPatientId
                                            ? patientNameById.get(row.matchedPatientId) ?? row.patientName ?? 'Assign patient'
                                            : 'Assign patient'}
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-sm font-medium text-ink">{row.patientName || '—'}</div>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2 align-top">
                                <div className="space-y-2">
                                  <div className="min-h-[1rem] text-xs text-transparent" aria-hidden="true"></div>
                                  {row.externalSource === 'google' ? (
                                    <div>
                                      {activeEditor === editorKey('service', googleEventId) ? (
                                        <SelectField<string>
                                          value={row.matchedServiceId ?? null}
                                          onChange={value => {
                                            handleGoogleServiceAssignment(googleEventId, value)
                                            setActiveEditor(null)
                                          }}
                                          options={serviceOptions}
                                          placeholder="Assign service"
                                          menuClassName="w-full"
                                        />
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setActiveEditor(editorKey('service', googleEventId))}
                                          className="w-full truncate border-0 border-b border-brand-300/40 bg-transparent px-0 py-2 text-left text-sm text-ink transition-colors hover:border-brand-300 focus:border-brand-300 focus:outline-none"
                                        >
                                          {row.matchedServiceId
                                            ? serviceOptionById.get(row.matchedServiceId)?.label ?? row.serviceName ?? 'Assign service'
                                            : 'Assign service'}
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-ink/80">{row.serviceName || '—'}</div>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2 align-top text-ink/80">
                                <div className="space-y-2">
                                  <div className="min-h-[1rem] text-xs text-transparent" aria-hidden="true"></div>
                                  <div>{row.start ? new Date(row.start).toLocaleString() : '—'}</div>
                                </div>
                              </td>

                              <td className="px-3 py-2 align-top">
                                <div className="space-y-2">
                                  <div className="min-h-[1rem] text-xs text-transparent" aria-hidden="true"></div>
                                  {row.externalSource === 'google' ? (
                                    <div className="space-y-2">
                                      <span
                                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${badgeClassesForClassification(row.importClassification)}`}
                                      >
                                        {labelForClassification(row.importClassification)}
                                      </span>
                                      <div>
                                        <span
                                          className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${badgeClassesForConfidence(row.importConfidence)}`}
                                        >
                                          {labelForConfidence(row.importConfidence)}
                                        </span>
                                      </div>
                                      {row.duplicateStatus === 'possible' && (
                                        <div className="text-xs text-amber-700">Possible duplicate</div>
                                      )}
                                      {row.duplicateStatus === 'existing-import' && (
                                        <div className="text-xs text-rose-700">Already imported</div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-ink/80">{row.status}</div>
                                  )}
                                </div>
                              </td>

                              <td className="px-3 py-2 align-top">
                                <div className="space-y-2">
                                  <div className="min-h-[1rem] text-xs text-transparent" aria-hidden="true"></div>
                                  {row.externalSource === 'google' ? (
                                    <div className="space-y-1">
                                      <span
                                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                                          rowReady
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : row.errors.length > 0
                                              ? 'bg-rose-100 text-rose-700'
                                              : isSelected
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-brand-100 text-brand-800'
                                        }`}
                                      >
                                        {rowReady
                                          ? 'Ready'
                                          : row.errors.length > 0
                                            ? 'Blocked'
                                            : isSelected
                                              ? 'Needs review'
                                              : 'Not selected'}
                                      </span>

                                      {row.errors.map(item => (
                                        <div key={item} className="truncate text-xs text-rose-700" title={item}>
                                          • {item}
                                        </div>
                                      ))}

                                      {rowMessages.map(item => (
                                        <div key={item} className="truncate text-xs text-amber-700" title={item}>
                                          • {item}
                                        </div>
                                      ))}
                                    </div>
                                  ) : row.isValid ? (
                                    <div className="space-y-1">
                                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                        Ready
                                      </span>
                                      {row.warnings.map(item => (
                                        <div key={item} className="truncate text-xs text-amber-700" title={item}>
                                          • {item}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      {row.errors.map(item => (
                                        <div key={item} className="truncate text-xs text-amber-700" title={item}>
                                          • {item}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-brand-300/40 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-300/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={validRows.length === 0 || submitting}
                onClick={() => void handleImport()}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {submitting
                  ? 'Importing…'
                  : `Import ${validRows.length} booking${validRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
