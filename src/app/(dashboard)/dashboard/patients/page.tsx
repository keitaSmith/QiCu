'use client'

import { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'

import { PATIENTS } from '@/data/patients'
import { BOOKINGS } from '@/data/bookings'
import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'
import { exportPatientPdf, exportPatientsCsv } from '@/lib/export/patients'
import { PatientDialog } from './patient-dialog'
import { SessionDialog } from '@/components/sessions/SessionDialog'

import { toCoreView, type PatientCoreView } from "@/models/patient.coreView";

import { isSameLocalDay, startOfDay } from '@/lib/dates'

// UI primitives
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { PatientsActionButtons } from '@/components/ui/RowActions'
import { StatusBadge } from '@/components/ui/StatusBadge'

// Toggle this to inspect what's detected as "today"
const DEBUG_TODAY = false

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export default function PatientsPage() {
  const [q, setQ] = useState('')
  const [onlyToday, setOnlyToday] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  // Local working list (starts from seeds)
  const [patients, setPatients] = useState<FhirPatient[]>(() => [...PATIENTS])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingPatient, setEditingPatient] = useState<FhirPatient | undefined>(undefined)

  //session dialog state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sessionPatient, setSessionPatient] = useState<{ id: string; name: string } | null>(null)

  const needle = q.trim().toLowerCase()
  const now = new Date()

  /**
   * Build a Set of patientIds who have ANY non-cancelled booking today,
   * using the SAME logic as your Bookings page:
   * - source fields: patientId, start
   * - same day comparer: isSameLocalDay
   * - optional status filter (exclude cancelled)
   */
  const todaysByPatient = useMemo(() => {
    const set = new Set<string>()

    const items = (BOOKINGS as any[])
      .map(b => ({ ...b, startD: new Date(b.start) }))
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
      // eslint-disable-next-line no-console
      console.log('[PatientsPage] todaysByPatient:', Array.from(set))
      // eslint-disable-next-line no-console
      console.log('[PatientsPage] sample today?', items.slice(0, 3))
    }

    return set
  }, [now])

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
  
  const rows: PatientCoreView[] = useMemo(
  () => filtered.map(toCoreView),
  [filtered]
);
const bookingToday=(p:FhirPatient)=>{
  return p.id ? todaysByPatient.has(p.id) : false
}
  return (
    <div className="space-y-4">
      {/* Header / toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-ink">Patients</h1>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative sm:w-auto">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-ink/50" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name, email, mobile…"
              className="w-full sm:w-64 rounded-lg bg-surface pl-8 pr-3 py-2 text-sm text-ink outline-none placeholder:text-ink/50"
            />
          </div>

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

      {/* Table */}
      <div className="hidden md:block">
      <TableFrame>
        <TableEl>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Mobile</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {filtered.map(p => {
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
                    <StatusBadge status={s as any} />
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
        setDialogMode('edit')
        setEditingPatient(p)
        setDialogOpen(true)
      }}
      onEdit={() => {
        setDialogMode('edit')
        setEditingPatient(p)
        setDialogOpen(true)
      }}
      onDelete={() => {
        if (confirm(`Delete ${Patient.displayName(p)}? This cannot be undone.`)) {
          setPatients(prev => prev.filter(x => x.id !== p.id))
        }
      }}
      extras={[
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
              onSelect: () =>
                setPatients(prev =>
                  prev.map(x => (x.id === p.id ? Patient.unarchive(x) : x)),
                ),
            }
          : {
              label: 'Archive',
              onSelect: () =>
                setPatients(prev =>
                  prev.map(x => (x.id === p.id ? Patient.archive(x) : x)),
                ),
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
          </TBody>
        </TableEl>
      </TableFrame>
</div>

{/* CARDS – mobile / tablet (below md) */}
<div className="space-y-3 md:hidden">
  {filtered.length === 0 && (
    <div className="rounded-xl border border-brand-300/30 bg-surface p-4 text-center text-sm text-ink/60">
      No patients found.
    </div>
  )}

  {filtered.map(p => {
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
              setDialogMode('edit')
              setEditingPatient(p)
              setDialogOpen(true)
            }}
            onEdit={() => {
              setDialogMode('edit')
              setEditingPatient(p)
              setDialogOpen(true)
            }}
            onDelete={() => {
              if (
                confirm(
                  `Delete ${Patient.displayName(
                    p,
                  )}? This cannot be undone.`,
                )
              ) {
                setPatients(prev =>
                  prev.filter(x => x.id !== p.id),
                )
              }
            }}
            extras={[
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
                    onSelect: () =>
                      setPatients(prev =>
                        prev.map(x =>
                          x.id === p.id
                            ? Patient.unarchive(x)
                            : x,
                        ),
                      ),
                  }
                : {
                    label: 'Archive',
                    onSelect: () =>
                      setPatients(prev =>
                        prev.map(x =>
                          x.id === p.id
                            ? Patient.archive(x)
                            : x,
                        ),
                      ),
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
      <PatientDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        initialPatient={editingPatient}
        onCreate={created => setPatients(prev => [created, ...prev])}
        onUpdate={updated =>
          setPatients(prev => prev.map(p => (p.id === updated.id ? updated : p)))
        }
      />
      <SessionDialog
        open={sessionDialogOpen}
        onClose={() => setSessionDialogOpen(false)}
        patientId={sessionPatient?.id ?? null}
        patientName={sessionPatient?.name}
        // No onCreated needed here, since the Patients page does not show sessions.
      />
    </div>
  )
}
