'use client'

import { useMemo, useState } from 'react'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'

import { PATIENTS } from '@/data/patients'
import { BOOKINGS } from '@/data/bookings'
import type { FhirPatient } from '@/models/patient'
import * as Patient from '@/models/patient'
import { exportPatientPdf, exportPatientsCsv } from '@/lib/export/patients'
import { PatientDialog } from './patient-dialog'

// ✅ use the SAME date helpers as Bookings page for parity
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

  return (
    <div className="space-y-4">
      {/* Header / toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Patients</h1>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-ink/50" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name, email, mobile…"
              className="w-64 rounded-lg border px-7 py-2 text-sm outline-none"
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
              const s = Patient.status(p) // 'active' | 'inactive'
              const hasToday = p.id ? todaysByPatient.has(p.id) : false
              return (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span>{Patient.displayName(p)}</span>
                      
                    </div>
                  </Td>
                  <Td>{Patient.primaryEmail(p) || '—'}</Td>
                  <Td>{Patient.primaryMobile(p) || '—'}</Td>
                  <Td>
                    {/* your StatusBadge now accepts patient statuses too */}
                    <StatusBadge status={s as any} />
                  </Td>
                  
                  <Td>
                    {hasToday && (
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] border-sky-300 text-sky-800 bg-sky-50">
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
                        {
                          label: 'Export PDF',
                          onSelect: () => exportPatientPdf(p),
                        },
                        s === 'inactive'
                          ? {
                              label: 'Unarchive',
                              onSelect: () =>
                                setPatients(prev =>
                                  prev.map(x => (x.id === p.id ? Patient.unarchive(x) : x))
                                ),
                            }
                          : {
                              label: 'Archive',
                              onSelect: () =>
                                setPatients(prev =>
                                  prev.map(x => (x.id === p.id ? Patient.archive(x) : x))
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
                  </Td>
                </Tr>
              )
            })}
          </TBody>
        </TableEl>
      </TableFrame>

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
    </div>
  )
}
