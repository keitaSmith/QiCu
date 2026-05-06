'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { SearchField } from '@/components/ui/SearchField'
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { SessionActionButtons } from '@/components/ui/RowActions'
import { SessionDialog } from '@/components/sessions/SessionDialog'
import { useSnackbar } from '@/components/ui/Snackbar'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CardListSkeleton } from '@/components/ui/CardListSkeleton'
import { useRightPanel } from '@/components/layout/RightPanelContext'
import { SessionDetailPanel } from '@/components/sessions/SessionDetailPanel'
import { useBookings } from '@/hooks/useBookings'
import { useSessions } from '@/hooks/useSessions'
import { usePatients } from '@/hooks/usePatients'
import { dateFmt as dt, timeFmt } from '@/lib/dates'
import { displayName, nameMap } from '@/lib/patients/selectors'
import type { Session } from '@/models/session'
import { getErrorMessage } from '@/lib/errors'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { canUsePatientInActiveWorkflow } from '@/lib/patientWorkflow'

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

export default function SessionsPage() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPatient, setDialogPatient] = useState<{ id: string; name: string } | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [sessionToTrash, setSessionToTrash] = useState<Session | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const { showSnackbar } = useSnackbar()
  const { setRightPanelContent } = useRightPanel()
  const { bookings, loading: bookingsLoading, error: bookingsError } = useBookings()
  const { sessions, loading: sessionsLoading, error: sessionsError, deleteSessionRecord } = useSessions()
  const { patients, loading: patientsLoading } = usePatients()

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  const bookingMap = useMemo(
    () => new Map(bookings.map(b => [b.id, { id: b.id, code: b.code, start: b.start }])),
    [bookings],
  )

  const patientOptions = useMemo(
    () =>
      patients
        .filter(canUsePatientInActiveWorkflow)
        .map(p => ({ id: p.id ?? '', name: displayName(p) })),
    [patients],
  )

  const names = useMemo(() => nameMap(patients), [patients])

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase()
    if (!qn) return sessions

    return sessions.filter(s => {
      const patientName = names.get(s.patientId)?.toLowerCase() ?? ''
      const complaint = s.chiefComplaint.toLowerCase()
      const serviceName = (s.serviceName ?? '').toLowerCase()
      const treatmentSummary = (s.treatmentSummary ?? '').toLowerCase()
      const outcome = (s.outcome ?? '').toLowerCase()
      return [patientName, complaint, serviceName, treatmentSummary, outcome].some(value =>
        value.includes(qn),
      )
    })
  }, [sessions, q, names])

  function handleOpenNew() {
    setDialogMode('create')
    setEditingSession(null)
    setDialogPatient(null)
    setDialogOpen(true)
  }

  function handleEdit(session: Session) {
    setDialogMode('edit')
    setEditingSession(session)
    const name = names.get(session.patientId) ?? 'Patient'
    setDialogPatient({ id: session.patientId, name })
    setDialogOpen(true)
  }

  function handleAddForPatient(patientId: string) {
    const patient = patients.find(item => item.id === patientId)
    if (!canUsePatientInActiveWorkflow(patient)) {
      showSnackbar({
        variant: 'error',
        message: 'Archived patients cannot be used for new sessions. Reactivate the patient first.',
      })
      return
    }

    const name = names.get(patientId) ?? 'Patient'
    setDialogMode('create')
    setEditingSession(null)
    setDialogPatient({ id: patientId, name })
    setDialogOpen(true)
  }

  async function handleDeleteConfirmed() {
    if (!sessionToTrash) return
    setConfirmLoading(true)
    try {
      await deleteSessionRecord(sessionToTrash.id)
      showSnackbar({ variant: 'success', message: 'Session moved to Trash. You can restore it for 30 days.' })
      setSessionToTrash(null)
    } catch (error: unknown) {
      showSnackbar({ variant: 'error', message: getErrorMessage(error, 'Failed to delete session.') })
    } finally {
      setConfirmLoading(false)
    }
  }

  function showSessionDetails(session: Session) {
    const patientName = names.get(session.patientId) ?? session.patientId
    const render = <SessionDetailPanel session={session} patientName={patientName} />

    if (window.innerWidth >= 1024) {
      setRightPanelContent(render)
      return
    }

    router.push(`/dashboard/sessions/${session.id}`)
  }

  const loading = sessionsLoading || bookingsLoading || patientsLoading

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Sessions</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search patient, complaint, service…"
            inputClassName="sm:w-72"
          />

          <button
            type="button"
            onClick={handleOpenNew}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none"
          >
            New session
          </button>
        </div>
      </div>

      {(sessionsError || bookingsError) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {sessionsError ?? bookingsError}
        </div>
      ) : null}

      <div className="hidden md:block">
        <TableFrame>
          <TableEl>
            <THead>
              <Tr>
                <Th className="rounded-tl-md rounded-bl-md">Patient</Th>
                <Th>Date</Th>
                <Th>Time</Th>
                <Th>Service</Th>
                <Th>Complaint</Th>
                <Th>Booking</Th>
                <Th className="text-right rounded-tr-md rounded-br-md">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {loading && <TableSkeleton rows={3} columns={7} />}

              {!loading && filtered.map(s => {
                const when = new Date(s.startDateTime)
                const patientName = names.get(s.patientId) ?? s.patientId
                const linkedBooking = s.bookingId ? bookingMap.get(s.bookingId) ?? null : null

                return (
                  <Tr key={s.id}>
                    <Td className="text-ink">{patientName}</Td>
                    <Td className="text-ink/80">{dt.format(when)}</Td>
                    <Td className="text-ink/80">{timeFmt.format(when)}</Td>
                    <Td className="text-ink/80">{s.serviceName ?? '—'}</Td>
                    <Td className="text-ink/80">{s.chiefComplaint}</Td>
                    <Td className="text-ink/80 text-sm">
                      {linkedBooking ? (
                        <>
                          <span className="font-medium">{linkedBooking.code}</span>{' '}
                          <span className="text-ink/60">
                            ({dt.format(new Date(linkedBooking.start))} · {timeFmt.format(new Date(linkedBooking.start))})
                          </span>
                        </>
                      ) : (
                        <span className="text-ink/60 text-xs">No booking</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <SessionActionButtons
                        onEdit={() => handleEdit(s)}
                        onView={() => showSessionDetails(s)}
                        onDelete={() => setSessionToTrash(s)}
                        deleteLabel="Move session to Trash"
                        extras={[{ label: 'Add session', onSelect: () => handleAddForPatient(s.patientId) }]}
                      />
                    </Td>
                  </Tr>
                )
              })}

              {!loading && filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={7} className="py-10 text-center text-sm text-ink/60">
                    No sessions yet. Click <span className="font-medium">New session</span> to record your first treatment.
                  </Td>
                </Tr>
              ) : null}
            </TBody>
          </TableEl>
        </TableFrame>
      </div>

      <div className="space-y-3 md:hidden">
        {loading && <CardListSkeleton items={4} lines={3} />}

        {!loading && filtered.length === 0 ? (
          <div className="rounded-xl border border-brand-300/30 bg-surface px-4 py-6 text-sm text-ink/70">
            No sessions yet. Tap <span className="font-medium">New session</span> to record your first treatment.
          </div>
        ) : null}

        {!loading && filtered.map(s => {
          const when = new Date(s.startDateTime)
          const linkedBooking = s.bookingId ? bookingMap.get(s.bookingId) ?? null : null
          return (
            <article key={s.id} className="rounded-xl border border-brand-300/30 bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">{names.get(s.patientId) ?? s.patientId}</div>
                  <div className="mt-0.5 text-sm text-ink/70">{dt.format(when)} · {timeFmt.format(when)}</div>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm text-ink/80">
                <p><span className="font-medium">Service:</span> {s.serviceName || '—'}</p>
                <p><span className="font-medium">Complaint:</span> {s.chiefComplaint}</p>
                {s.outcome ? <p><span className="font-medium">Outcome:</span> {truncateText(s.outcome, 88)}</p> : null}
                <p><span className="font-medium">Booking:</span> {linkedBooking ? linkedBooking.code : 'No booking'}</p>
              </div>

              <div className="mt-4 flex justify-end">
                <SessionActionButtons
                  onEdit={() => handleEdit(s)}
                  onView={() => showSessionDetails(s)}
                  onDelete={() => setSessionToTrash(s)}
                  deleteLabel="Move session to Trash"
                  extras={[{ label: 'Add session', onSelect: () => handleAddForPatient(s.patientId) }]}
                />
              </div>
            </article>
          )
        })}
      </div>

      <ConfirmDialog
        open={sessionToTrash !== null}
        onClose={() => setSessionToTrash(null)}
        onConfirm={handleDeleteConfirmed}
        loading={confirmLoading}
        variant="destructive"
        title="Move session to Trash?"
        description="This session will be moved to Trash for 30 days. Linked booking references will be handled safely."
        confirmLabel="Move to Trash"
      >
        {sessionToTrash ? (
          <div className="space-y-1">
            <p className="font-medium text-ink">{names.get(sessionToTrash.patientId) ?? sessionToTrash.patientId}</p>
            <p>{sessionToTrash.serviceName ?? 'Session record'}</p>
          </div>
        ) : null}
      </ConfirmDialog>

      <SessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        session={editingSession ?? undefined}
        patientId={dialogPatient?.id ?? null}
        patientName={dialogPatient?.name}
        patients={patientOptions}
        bookings={bookings}
      />
    </div>
  )
}
