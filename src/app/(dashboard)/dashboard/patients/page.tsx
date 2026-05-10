'use client'

import { useMemo, useState,useEffect } from 'react'
import { useRightPanel } from '@/components/layout/RightPanelContext'
import { PatientDetailPanel } from '@/components/patients/PatientDetailPanel'
import { FunnelIcon } from '@heroicons/react/24/outline'
import { SearchField } from '@/components/ui/SearchField'

import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'
import { exportPatientPdf, exportPatientsCsv } from '@/lib/export/patients'
import { PatientDialog } from './patient-dialog'
import { SessionDialog } from '@/components/sessions/SessionDialog'

import { toCoreView, type PatientCoreView } from "@/models/patient.coreView";

import { isSameLocalDay } from '@/lib/dates'

// UI primitives
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { PatientsActionButtons } from '@/components/ui/RowActions'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CardListSkeleton } from '@/components/ui/CardListSkeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { usePatients } from '@/hooks/usePatients'
import { useBookings } from '@/hooks/useBookings'
import { useSessions } from '@/hooks/useSessions'
import { useSnackbar } from '@/components/ui/Snackbar'
import { usePractitioner } from '@/components/layout/PractitionerContext'
import { buildPractitionerScopedFetchInit } from '@/lib/auth/clientFetch'

// Toggle this to inspect what's detected as "today"
const DEBUG_TODAY = false

type PatientImpact = {
  pastBookings: number
  futureBookings: number
  bookings: number
  sessions: number
}

type PatientConfirmAction =
  | { kind: 'archive'; patient: FhirPatient; impact: PatientImpact }
  | { kind: 'delete'; patient: FhirPatient; impact: PatientImpact }

type ArchiveFutureBookingChoice = 'keep' | 'cancel'

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function PatientsPage() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { showSnackbar } = useSnackbar()
  const practitionerScope = usePractitioner()
  const [q, setQ] = useState('')
  const [onlyToday, setOnlyToday] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const [, setSelectedPatient] = useState<FhirPatient | null>(null)
  const { setRightPanelContent } = useRightPanel()
  
  // Clear the right panel when this page mounts
  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  const {
    patients,
    loading,
    error,
    createPatientRecord,
    patchPatientById,
    deletePatientById,
    replacePatient,
  } = usePatients()
  const { bookings } = useBookings()
  const { sessions } = useSessions()

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingPatient, setEditingPatient] = useState<FhirPatient | undefined>(undefined)

  //session dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionPatient, setSessionPatient] = useState<{ id: string; name: string } | null>(null)
  const [patientConfirmAction, setPatientConfirmAction] = useState<PatientConfirmAction | null>(null)
  const [archiveFutureBookingChoice, setArchiveFutureBookingChoice] =
    useState<ArchiveFutureBookingChoice | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const needle = q.trim().toLowerCase()
  const now = useMemo(() => new Date(), [])

  /**
   * Build a Set of patientIds who have ANY non-cancelled booking today,
   * using the SAME logic as your Bookings page:
   * - source fields: patientId, start
   * - same day comparer: isSameLocalDay
   * - optional status filter (exclude cancelled)
   */
  const todaysByPatient = useMemo(() => {
    const set = new Set<string>()

    const items = bookings
      .map(booking => ({ ...booking, startD: new Date(booking.start) }))
      // Guard against invalid dates
      .filter(b => !isNaN(b.startD.getTime()))

    for (const b of items) {
      // Exclude cancelled from counting as "today", like most flows
      if (String(b.status).toLowerCase() === 'cancelled') continue
      if (isSameLocalDay(b.startD, now)) {
        const pid = String(b.patientId ?? '')
        if (pid) set.add(pid)
      }
    }

    if (DEBUG_TODAY) {
      console.log('[PatientsPage] todaysByPatient:', Array.from(set))
      console.log('[PatientsPage] sample today?', items.slice(0, 3))
    }

    return set
  }, [bookings, now])

  // Filter/search list (search matches name/email/mobile)
  const filtered = useMemo(() => {
    return patients.filter(p => {
      if (!showArchived && p.active === false) return false

      // search match
      if (needle) {
        const nm = Patient.displayName(p).toLowerCase()
        const em = Patient.primaryEmail(p).toLowerCase()
        const ph = Patient.primaryMobile(p).toLowerCase()
        if (!(nm.includes(needle) || em.includes(needle) || ph.includes(needle))) {
          return false
        }
      }

      // today filter
      if (onlyToday) {
        const id = p.id ?? ''
        return id && todaysByPatient.has(id)
      }

      return true
    })
  }, [patients, showArchived, needle, onlyToday, todaysByPatient])
  
const bookingToday=(p:FhirPatient)=>{
  return p.id ? todaysByPatient.has(p.id) : false
}

function handleViewPatient(p: FhirPatient) {
  if (isDesktop) {
    const bookingsForPatient = bookings.filter(b => b.patientId === p.id)
    setSelectedPatient(p)
    setRightPanelContent(
      <PatientDetailPanel patient={p} bookingsForPatient={bookingsForPatient} />,
    )
  } else {
    router.push(`/dashboard/patients/${p.id}`)
  }
}

function getPatientImpact(patientId: string) {
  const now = Date.now()
  const linkedBookings = bookings.filter(booking => booking.patientId === patientId)
  const futureBookings = linkedBookings.filter(
    booking => String(booking.status).toLowerCase() !== 'cancelled' && new Date(booking.start).getTime() > now,
  ).length
  return {
    pastBookings: linkedBookings.filter(booking => new Date(booking.start).getTime() <= now).length,
    futureBookings,
    bookings: linkedBookings.length,
    sessions: sessions.filter(session => session.patientId === patientId).length,
  }
}

function openArchivePatientDialog(p: FhirPatient) {
  const impact = getPatientImpact(p.id ?? '')
  setArchiveFutureBookingChoice(impact.futureBookings > 0 ? null : 'keep')
  setPatientConfirmAction({ kind: 'archive', patient: p, impact })
}

async function archivePatientFromDialog(p: FhirPatient) {
  const res = await fetch(`/api/patients/${encodeURIComponent(p.id ?? '')}/archive`, {
    method: 'POST',
    ...buildPractitionerScopedFetchInit(practitionerScope, {
      headers: { 'Content-Type': 'application/json' },
    }),
    body: JSON.stringify({ cancelFutureBookings: archiveFutureBookingChoice === 'cancel' }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.patient) {
    showSnackbar({ variant: 'error', message: data?.error ?? 'Failed to archive patient.' })
    return
  }

  replacePatient(data.patient)
  showSnackbar({ variant: 'success', message: 'Patient archived. History was preserved.' })
}

async function handleExportPatientData(p: FhirPatient) {
  const res = await fetch(
    `/api/patients/${encodeURIComponent(p.id ?? '')}/export`,
    buildPractitionerScopedFetchInit(practitionerScope),
  )
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    showSnackbar({ variant: 'error', message: data?.error ?? 'Failed to export patient data.' })
    return
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `qicu-patient-${p.id ?? 'export'}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  showSnackbar({ variant: 'success', message: 'Patient data exported.' })
}

function openDeletePatientDataDialog(p: FhirPatient) {
  setArchiveFutureBookingChoice(null)
  setPatientConfirmAction({ kind: 'delete', patient: p, impact: getPatientImpact(p.id ?? '') })
}

async function deletePatientDataFromDialog(p: FhirPatient) {
  const moved = await deletePatientById(p.id ?? '')
  if (moved) {
    showSnackbar({ variant: 'success', message: 'Patient data moved to Trash. You can restore it for 30 days.' })
    if (isDesktop) setRightPanelContent(null)
  } else {
    showSnackbar({ variant: 'error', message: 'Failed to move patient data to Trash.' })
  }
}

async function handleConfirmPatientAction() {
  if (!patientConfirmAction) return
  if (
    patientConfirmAction.kind === 'archive' &&
    patientConfirmAction.impact.futureBookings > 0 &&
    !archiveFutureBookingChoice
  ) {
    return
  }
  setConfirmLoading(true)
  try {
    if (patientConfirmAction.kind === 'archive') {
      await archivePatientFromDialog(patientConfirmAction.patient)
    } else {
      await deletePatientDataFromDialog(patientConfirmAction.patient)
    }
    setPatientConfirmAction(null)
    setArchiveFutureBookingChoice(null)
  } finally {
    setConfirmLoading(false)
  }
}

function closePatientConfirmDialog() {
  if (confirmLoading) return
  setPatientConfirmAction(null)
  setArchiveFutureBookingChoice(null)
}

  const archiveNeedsFutureBookingDecision =
    patientConfirmAction?.kind === 'archive' && patientConfirmAction.impact.futureBookings > 0

  return (
    <div className="space-y-4">
      {/* Header / toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Patients</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Search */}
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search name, email, mobile…"
          />

          {/* Today filter */}
          <button
            type="button"
            onClick={() => setOnlyToday(v => !v)}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
              onlyToday
                ? 'bg-brand-700 text-white hover:bg-brand-600'
                : 'border border-brand-300/50 bg-surface text-ink hover:bg-transparent'
            )}
            title="Show only patients with bookings today"
          >
            <FunnelIcon className="h-4 w-4" />
            {onlyToday ? 'Showing: Today' : 'Filter: Today'}
          </button>

          {/* Toggle archived */}
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
              showArchived
                ? 'bg-brand-700 text-white hover:bg-brand-600'
                : 'border border-brand-300/50 bg-surface text-ink hover:bg-transparent'
            )}
            title="Toggle archived patients"
          >
            Archived
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => exportPatientsCsv(filtered)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300/50 bg-surface px-3 py-2 text-sm text-ink hover:bg-transparent"
          >
            Export CSV
          </button>

          {/* New patient */}
          <button
            type="button"
            onClick={() => {
              setDialogMode('create')
              setEditingPatient(undefined)
              setDialogOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600"
          >
            New patient
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="hidden md:block">
      <TableFrame>
        <TableEl>
          <THead>
            <Tr>
              <Th className='rounded-tl-md rounded-bl-md'>Name</Th>
              <Th>Email</Th>
              <Th>Mobile</Th>
              <Th>Status</Th>
              <Th className="text-right rounded-tr-md rounded-br-md">Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {loading && <TableSkeleton rows={6} columns={5} />}

            {!loading && filtered.map(p => {
              const row: PatientCoreView = toCoreView(p);
              const s = Patient.status(p) // 'active' | 'inactive'
              const hasToday = bookingToday(p)
              return (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>{row.name}</span>
                      
                    </div>
                  </Td>
                  <Td>{row.email || '—'}</Td>
                  <Td>{row.mobile || '—'}</Td>
                  <Td>
                    {/* your StatusBadge now accepts patient statuses too */}
                    <StatusBadge status={s} />
                  </Td>
                  
                  <Td className="align-middle">
  <div className="flex flex-row items-center justify-end gap-10 h-full">
    {hasToday && (
      <span className="inline-flex items-center justify-center rounded-full border-3 px-2 py-0.5 text-[11px] border-emerald-100 bg-emerald-600 text-white">
        Today
      </span>
    )}

    <PatientsActionButtons
      onView={() => {
        handleViewPatient(p)
      }}
      onEdit={() => {
        setDialogMode('edit')
        setEditingPatient(p)
        setDialogOpen(true)
      }}
      onDelete={async () => {
        openDeletePatientDataDialog(p)
      }}
      deleteLabel="Delete patient data"
      extras={[
        { label: 'Export patient data', onSelect: () => void handleExportPatientData(p) },
        { label: 'Export PDF', onSelect: () => exportPatientPdf(p) },
        {
          label: 'Add session',
          onSelect: () => {
            setSessionPatient({
              id: p.id ?? '',
              name: Patient.displayName(p),
            })
            setSessionDialogOpen(true)
          },
        },
        s === 'inactive'
          ? {
              label: 'Unarchive',
              onSelect: async () => {
                const updated = Patient.unarchive(p)
                await patchPatientById(p.id ?? '', updated)
                showSnackbar({ variant: 'success', message: 'Patient reactivated.' })
              },
            }
          : {
              label: 'Archive patient',
              onSelect: () => openArchivePatientDialog(p),
            },
        {
          label: 'New booking',
          onSelect: () => {
            const url = new URL(window.location.origin + '/dashboard/bookings')
            url.searchParams.set('patientId', p.id ?? '')
            window.location.href = url.toString()
          },
        },
      ]}
    />
  </div>
</Td>

                </Tr>
              )
            })}
            {!loading && filtered.length === 0 && (
              <Tr>
                <Td className="text-center text-ink/60" colSpan={5}>
                  No patients found.
                </Td>
              </Tr>
            )}
          </TBody>
        </TableEl>
      </TableFrame>
</div>

{/* CARDS – mobile / tablet (below md) */}
<div className="space-y-3 md:hidden">
  {loading && <CardListSkeleton items={4} lines={3} />}

  {!loading && filtered.length === 0 && (
    <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
      No patients found.
    </div>
  )}

  {!loading && filtered.map(p => {
    const hasToday = bookingToday(p)
    const s = p.active === false ? 'inactive' : 'active'
    const name = Patient.displayName(p)

    return (
      <div
        key={p.id}
        className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm"
      >
        {/* Top row: name + Today badge (if any) */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-ink">
              {name}
            </div>
            {/* You can show an ID or something small here if you want */}
            {p.id && (
              <div className="text-xs text-ink/60">ID: {p.id}</div>
            )}
          </div>

          {hasToday && (
            <span className="inline-flex items-center justify-center rounded-full border-3 px-2 py-0.5 text-[11px] border-emerald-100 bg-emerald-600 text-white">
              Today
            </span>
          )}
        </div>

        {/* Middle: key details */}
        <div className="space-y-1 text-sm text-ink/75">
          {p.telecom?.find(t => t.system === 'phone') && (
            <div>
              <span className="font-medium">Phone: </span>
              {
                p.telecom.find(t => t.system === 'phone')!
                  .value
              }
            </div>
          )}

          {p.telecom?.find(t => t.system === 'email') && (
            <div>
              <span className="font-medium">Email: </span>
              {
                p.telecom.find(t => t.system === 'email')!
                  .value
              }
            </div>
          )}

          {p.birthDate && (
            <div>
              <span className="font-medium">Birth date: </span>
              {p.birthDate}
            </div>
          )}

          <div>
            <span className="font-medium">Status: </span>
            {s === 'inactive' ? 'Archived' : 'Active'}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-3 flex justify-end">
          <PatientsActionButtons
            onView={() => {
              handleViewPatient(p)
            }}
            onEdit={() => {
              setDialogMode('edit')
              setEditingPatient(p)
              setDialogOpen(true)
            }}
            onDelete={() => {
              openDeletePatientDataDialog(p)
            }}
            deleteLabel="Delete patient data"
            extras={[
              {
                label: 'Export patient data',
                onSelect: () => void handleExportPatientData(p),
              },
              {
                label: 'Export PDF',
                onSelect: () => exportPatientPdf(p),
              },
              {
                label: 'Add session',
                onSelect: () => {
                  setSessionPatient({
                    id: p.id ?? '',
                    name,
                  })
                  setSessionDialogOpen(true)
                },
              },
              s === 'inactive'
                ? {
                    label: 'Unarchive',
                    onSelect: async () => {
                      const updated = Patient.unarchive(p)
                      await patchPatientById(p.id ?? '', updated)
                      showSnackbar({ variant: 'success', message: 'Patient reactivated.' })
                    },
                  }
                : {
                    label: 'Archive patient',
                    onSelect: () => openArchivePatientDialog(p),
                  },
              {
                label: 'New booking',
                onSelect: () => {
                  const url = new URL(
                    window.location.origin +
                      '/dashboard/bookings',
                  )
                  url.searchParams.set(
                    'patientId',
                    p.id ?? '',
                  )
                  window.location.href = url.toString()
                },
              },
            ]}
          />
        </div>
      </div>
    )
  })}
</div>

      {/* Dialog */}
      <ConfirmDialog
        open={patientConfirmAction !== null}
        onClose={closePatientConfirmDialog}
        onConfirm={handleConfirmPatientAction}
        loading={confirmLoading}
        confirmDisabled={archiveNeedsFutureBookingDecision && !archiveFutureBookingChoice}
        variant={patientConfirmAction?.kind === 'delete' ? 'destructive' : 'default'}
        title={patientConfirmAction?.kind === 'delete' ? 'Delete patient data?' : 'Archive patient?'}
        description={
          patientConfirmAction?.kind === 'delete'
            ? 'This will move the patient and linked records to Trash for 30 days. You can restore them before then.'
            : 'This patient will be removed from active patient lists, but their past bookings and session history will be kept.'
        }
        confirmLabel={patientConfirmAction?.kind === 'delete' ? 'Move to Trash' : 'Archive patient'}
      >
        {patientConfirmAction ? (
          <div className="space-y-2">
            <p className="font-medium text-ink">{Patient.displayName(patientConfirmAction.patient)}</p>
            {patientConfirmAction.kind === 'archive' ? (
              <>
                <p>Past bookings preserved: {patientConfirmAction.impact.pastBookings}</p>
                <p>Sessions preserved: {patientConfirmAction.impact.sessions}</p>
                {patientConfirmAction.impact.futureBookings > 0 ? (
                  <div className="space-y-3 pt-2">
                    <p className="font-medium text-ink">
                      This patient has {patientConfirmAction.impact.futureBookings} upcoming{' '}
                      {patientConfirmAction.impact.futureBookings === 1 ? 'booking' : 'bookings'}.
                    </p>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-ink">
                        What should happen to the upcoming bookings?
                      </legend>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-300/40 bg-surface px-3 py-2 hover:bg-brand-300/10">
                        <input
                          type="radio"
                          name="archive-future-bookings"
                          value="keep"
                          checked={archiveFutureBookingChoice === 'keep'}
                          onChange={() => setArchiveFutureBookingChoice('keep')}
                          className="mt-0.5 h-4 w-4 border-brand-300 text-brand-700 focus:ring-brand-600"
                        />
                        <span>Keep upcoming bookings active</span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-300/40 bg-surface px-3 py-2 hover:bg-brand-300/10">
                        <input
                          type="radio"
                          name="archive-future-bookings"
                          value="cancel"
                          checked={archiveFutureBookingChoice === 'cancel'}
                          onChange={() => setArchiveFutureBookingChoice('cancel')}
                          className="mt-0.5 h-4 w-4 border-brand-300 text-brand-700 focus:ring-brand-600"
                        />
                        <span>Cancel upcoming bookings</span>
                      </label>
                    </fieldset>
                  </div>
                ) : null}
                <p className="text-ink/60">You can reactivate the patient later if needed.</p>
              </>
            ) : (
              <>
                <p>Bookings: {patientConfirmAction.impact.bookings}</p>
                <p>Sessions: {patientConfirmAction.impact.sessions}</p>
                <p className="text-ink/60">After 30 days, this data can be permanently deleted.</p>
              </>
            )}
          </div>
        ) : null}
      </ConfirmDialog>

      <PatientDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        initialPatient={editingPatient}
        onCreate={async created => {
          await createPatientRecord(created)
        }}
        onUpdate={async updated => {
          await patchPatientById(updated.id ?? '', updated)
        }}
      />
      <SessionDialog
        open={sessionDialogOpen}
        onClose={() => setSessionDialogOpen(false)}
        patientId={sessionPatient?.id ?? null}
        patientName={sessionPatient?.name}
        bookings={bookings}
        // No onCreated needed here, since the Patients page does not show sessions.
      />
    </div>
  )
}
