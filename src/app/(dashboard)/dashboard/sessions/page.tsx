'use client'

import { useEffect, useMemo, useState } from 'react'
//import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { SearchField } from '@/components/ui/SearchField'
import { PATIENTS } from '@/data/patients'
import type { Session } from '@/models/session'
import { dateFmt as dt, timeFmt } from '@/lib/dates'
import { nameMap } from '@/lib/patients/selectors'
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { SessionActionButtons } from '@/components/ui/RowActions'
import { SessionDialog } from '@/components/sessions/SessionDialog'
import { useSnackbar } from '@/components/ui/Snackbar'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { useRightPanel } from '@/components/layout/RightPanelContext'
import { SessionDetailPanel } from '@/components/sessions/SessionDetailPanel'
export default function SessionsPage() {
  const [q, setQ] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogPatient, setDialogPatient] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const { showSnackbar } = useSnackbar()
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const { setRightPanelContent } = useRightPanel()

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  // Patient options for the "New session" dialog when opened from this page
  const patientOptions = useMemo(
    () =>
      PATIENTS.map(p => ({
        id: p.id ?? '',
        name:
          p.name?.[0]?.text ??
          [p.name?.[0]?.given?.[0], p.name?.[0]?.family].filter(Boolean).join(' ') ??
          'Unknown',
      })),
    [],
  )

  // stable name map for quick lookups
  const names = useMemo(() => nameMap(PATIENTS), [])

  // Initial load of all sessions (by calling per-patient endpoint for now)
  useEffect(() => {
    async function load() {
      try {
        const all: Session[] = []
        for (const p of PATIENTS) {
          if (!p.id) continue
          const res = await fetch(`/api/patients/${encodeURIComponent(p.id)}/sessions`)
          if (!res.ok) continue
          const items: Session[] = await res.json()
          all.push(...items)
        }
        all.sort(
          (a, b) =>
            new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime(),
        )
        setSessions(all)
      } catch (err) {
        console.error('Failed to load sessions', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase()
    if (!qn) return sessions

    return sessions.filter(s => {
      const patientName = names.get(s.patientId)?.toLowerCase() ?? ''
      const complaint = s.chiefComplaint.toLowerCase()
      const techniques = (s.techniques ?? []).join(', ').toLowerCase()
      return (
        patientName.includes(qn) ||
        complaint.includes(qn) ||
        techniques.includes(qn)
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
  const name = names.get(patientId) ?? 'Patient'
  setDialogMode('create')        // 👈 ensure we are NOT in edit mode
  setEditingSession(null)        // 👈 clear previous session
  setDialogPatient({ id: patientId, name })
  setDialogOpen(true)
}

  function handleDelete(sessionId: string) {
    if (!confirm('Delete this session? This cannot be undone.')) return
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    showSnackbar({
      variant: 'success',
      message: 'Session deleted (not yet persisted on server).',
    })
    // Later: also call DELETE /api/sessions/:id once that exists.
  }

  function showSessionDetails(session: Session) {
    const patientName = names.get(session.patientId) ?? session.patientId

    setSelectedSession(session)
    setRightPanelContent(
      <SessionDetailPanel
        session={session}
        patientName={patientName}
      />,
    )
  }

  return (
    <div className="space-y-4">
      {/* Header / toolbar – same responsive pattern as Bookings/Patients */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Sessions</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Search – full width on mobile */}
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search patient, complaint, techniques…"
            inputClassName="sm:w-72"
          />

          {/* New session */}
          <button
            type="button"
            onClick={handleOpenNew}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none"
          >
            New session
          </button>
        </div>
      </div>

      {/* TABLE – desktop (md+) */}
      <div className="hidden md:block">
        <TableFrame>
          <TableEl>
            <THead>
              <Tr>
                <Th className='rounded-tl-md rounded-bl-md'>Patient</Th>
                <Th>Date</Th>
                <Th>Time</Th>
                <Th>Chief complaint</Th>
                <Th>Techniques</Th>
                <Th className="text-right rounded-tr-md rounded-br-md">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {/* Skeleton while loading */}
              {loading && <TableSkeleton rows={3} columns={6} />}

              {/* Actual rows once loaded */}
              {!loading &&
                filtered.map(s => {
                  const when = new Date(s.startDateTime)
                  const patientName = names.get(s.patientId) ?? s.patientId
                  const techniques = (s.techniques ?? []).join(', ')

                  return (
                    <Tr key={s.id}>
                      <Td className="text-ink">{patientName}</Td>
                      <Td className="text-ink/80">{dt.format(when)}</Td>
                      <Td className="text-ink/80">{timeFmt.format(when)}</Td>
                      <Td className="text-ink/80">{s.chiefComplaint}</Td>
                      <Td className="text-ink/80">{techniques || '—'}</Td>
                      <Td className="text-right">
                        <SessionActionButtons
                          onEdit={() => handleEdit(s)}
                          onView={() => showSessionDetails(s)}
                          onDelete={() => handleDelete(s.id)}
                          extras={[
                            {
                              label: 'Add session',
                              onSelect: () => handleAddForPatient(s.patientId),
                            },
                          ]}
                        />
                      </Td>
                    </Tr>
                  )
                })}

              {!loading && filtered.length === 0 && (
                <Tr>
                  <Td colSpan={6} className="py-10 text-center text-sm text-ink/60">
                    No sessions yet. Click <span className="font-medium">New session</span> to
                    record your first treatment.
                  </Td>
                </Tr>
              )}
            </TBody>
          </TableEl>
        </TableFrame>
      </div>

      {/* CARDS – mobile / small screens */}
      <div className="space-y-3 md:hidden">
        {loading && (
          <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
            Loading sessions…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
            No sessions yet. Tap <span className="font-medium">New session</span> to record your
            first treatment.
          </div>
        )}

        {!loading &&
          filtered.map(s => {
            const when = new Date(s.startDateTime)
            const patientName = names.get(s.patientId) ?? s.patientId
            const techniques = (s.techniques ?? []).join(', ')

            return (
              <div
                key={s.id}
                className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm"
              >
                {/* Header: patient + datetime */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-ink">{patientName}</div>
                    <div className="mt-1 text-xs text-ink/70">
                      {dt.format(when)} · {timeFmt.format(when)}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-2 space-y-1 text-sm text-ink/75">
                  <div>
                    <span className="font-medium">Chief complaint: </span>
                    {s.chiefComplaint}
                  </div>
                  {techniques && (
                    <div>
                      <span className="font-medium">Techniques: </span>
                      {techniques}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex justify-end">
                  <SessionActionButtons
                    onEdit={() => handleEdit(s)}
                    onView={() => showSessionDetails(s)}
                    onDelete={() => handleDelete(s.id)}
                    extras={[
                      {
                        label: 'Add session',
                        onSelect: () => handleAddForPatient(s.patientId),
                      },
                    ]}
                  />
                </div>
              </div>
            )
          })}
      </div>

      {/* Create session dialog */}
      <SessionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          mode={dialogMode}
          session={editingSession ?? undefined}
          patientId={dialogPatient?.id ?? null}
          patientName={dialogPatient?.name}
          patients={patientOptions}
          onCreated={session => {
            setSessions(prev => [session, ...prev])
          }}
          onUpdated={session => {
            setSessions(prev =>
              prev.map(s => (s.id === session.id ? session : s)),
            )
          }}
        />
    </div>
  )
}
