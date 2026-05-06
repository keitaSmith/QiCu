'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useRightPanel } from '@/components/layout/RightPanelContext'
import { ServiceDetailPanel } from '@/components/services/ServiceDetailPanel'
import { ServiceDialog } from '@/components/services/ServiceDialog'
import { ServiceActionButtons } from '@/components/ui/RowActions'
import { SearchField } from '@/components/ui/SearchField'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableFrame, TableEl, THead, TBody, Tr, Th, Td } from '@/components/ui/QiCuTable'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CardListSkeleton } from '@/components/ui/CardListSkeleton'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useServices } from '@/hooks/useServices'
import { useBookings } from '@/hooks/useBookings'
import { useSessions } from '@/hooks/useSessions'
import type { Service } from '@/models/service'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type ServiceConfirmAction =
  | { kind: 'toggle'; service: Service }
  | { kind: 'delete'; service: Service }

export default function ServicesPage() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { setRightPanelContent } = useRightPanel()
  const { services, loading, error, createServiceRecord, patchServiceById, deleteServiceById } = useServices()
  const { bookings } = useBookings()
  const { sessions } = useSessions()

  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [confirmAction, setConfirmAction] = useState<ServiceConfirmAction | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => {
    setRightPanelContent(null)
  }, [setRightPanelContent])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return services.filter(service => {
      if (!showInactive && !service.active) return false
      if (!needle) return true
      return [service.name, service.description ?? '', String(service.durationMinutes)]
        .some(value => value.toLowerCase().includes(needle))
    })
  }, [services, q, showInactive])

  const confirmServiceUsage = useMemo(() => {
    if (!confirmAction) return { bookings: 0, sessions: 0, used: false }

    const serviceId = confirmAction.service.id
    const bookingCount = bookings.filter(booking => booking.serviceId === serviceId).length
    const sessionCount = sessions.filter(session => session.serviceId === serviceId).length

    return {
      bookings: bookingCount,
      sessions: sessionCount,
      used: bookingCount > 0 || sessionCount > 0,
    }
  }, [bookings, confirmAction, sessions])

  function handleViewService(service: Service) {
    if (isDesktop) {
      setRightPanelContent(<ServiceDetailPanel service={service} />)
      return
    }
    router.push(`/dashboard/services/${service.id}`)
  }

  function handleEdit(service: Service) {
    setDialogMode('edit')
    setEditingService(service)
    setDialogOpen(true)
  }

  async function handleToggleActive(service: Service) {
    await patchServiceById(service.id, { active: !service.active })
  }

  async function handleConfirmServiceAction() {
    if (!confirmAction) return
    setConfirmLoading(true)
    try {
      if (confirmAction.kind === 'toggle') {
        await handleToggleActive(confirmAction.service)
      } else {
        await deleteServiceById(confirmAction.service.id)
        if (isDesktop) setRightPanelContent(null)
      }
      setConfirmAction(null)
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-ink">Services</h1>

          <button
            type="button"
            onClick={() => {
              setDialogMode('create')
              setEditingService(null)
              setDialogOpen(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600"
          >
            New Service
          </button>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Search service name or duration…"
            inputClassName="sm:w-72"
          />

          <button
            type="button"
            onClick={() => setShowInactive(value => !value)}
            className={showInactive ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600' : 'inline-flex items-center gap-1.5 rounded-lg border border-brand-300/50 bg-surface px-3 py-2 text-sm text-ink hover:bg-transparent'}
          >
            {showInactive ? 'Showing inactive' : 'Hide inactive'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="hidden md:block">
        <TableFrame>
          <TableEl>
            <THead>
              <Tr>
                <Th className="rounded-tl-md rounded-bl-md">Service</Th>
                <Th>Duration</Th>
                <Th>Status</Th>
                <Th>Description</Th>
                <Th className="text-right rounded-tr-md rounded-br-md">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {loading && <TableSkeleton rows={4} columns={5} />}

              {!loading && filtered.map(service => (
                <Tr key={service.id}>
                  <Td className="text-ink">{service.name}</Td>
                  <Td className="text-ink/80">{service.durationMinutes} min</Td>
                  <Td><StatusBadge status={service.active ? 'active' : 'inactive'} showText /></Td>
                  <Td className="text-ink/80">{service.description?.trim() || '—'}</Td>
                  <Td className="text-right">
                    <ServiceActionButtons
                      onView={() => handleViewService(service)}
                      onDelete={() => setConfirmAction({ kind: 'delete', service })}
                      deleteLabel="Move service to Trash"
                      extras={[
                        { label: 'Edit service', onSelect: () => handleEdit(service) },
                        {
                          label: service.active ? 'Disable service' : 'Enable service',
                          onSelect: () => setConfirmAction({ kind: 'toggle', service }),
                        },
                      ]}
                    />
                  </Td>
                </Tr>
              ))}

              {!loading && filtered.length === 0 ? (
                <Tr>
                  <Td colSpan={5} className="py-10 text-center text-sm text-ink/60">
                    No services yet. Click <span className="font-medium">New Service</span> to add one.
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
            No services yet. Click <span className="font-medium">New Service</span> to add one.
          </div>
        ) : null}

        {!loading && filtered.map(service => (
          <article key={service.id} className="rounded-xl border border-brand-300/30 bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{service.name}</div>
                <div className="mt-0.5 text-sm text-ink/70">{service.durationMinutes} min</div>
              </div>
              <StatusBadge status={service.active ? 'active' : 'inactive'} showText={false} />
            </div>

            <p className="mt-3 text-sm text-ink/70">{service.description?.trim() || 'No description provided.'}</p>

            <div className="mt-4 flex justify-end">
              <ServiceActionButtons
                onView={() => handleViewService(service)}
                onDelete={() => setConfirmAction({ kind: 'delete', service })}
                deleteLabel="Move service to Trash"
                extras={[
                  { label: 'Edit service', onSelect: () => handleEdit(service) },
                  {
                    label: service.active ? 'Disable service' : 'Enable service',
                    onSelect: () => setConfirmAction({ kind: 'toggle', service }),
                  },
                ]}
              />
            </div>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmServiceAction}
        loading={confirmLoading}
        variant={confirmAction?.kind === 'delete' ? 'destructive' : 'default'}
        title={
          confirmAction?.kind === 'delete'
            ? 'Delete service?'
            : confirmAction?.service.active
              ? 'Disable service?'
              : 'Enable service?'
        }
        description={
          confirmAction?.kind === 'delete'
            ? confirmServiceUsage.used
              ? 'This service has been used in past bookings or sessions. Disabling is usually safer because it stops the service from being used in new bookings while keeping the service definition available for historical context.\n\nDeleting will move this service to Trash. Past bookings and sessions will keep their recorded service details where available, but the original service definition will no longer be active.'
              : 'Deleting will move this service to Trash for 30 days. This is best for mistakes, duplicates, or services that should not exist.'
            : confirmAction?.service.active
              ? 'This service will no longer be available for new bookings, but past bookings and sessions will keep their service history.'
              : 'This service will become available for new bookings again.'
        }
        confirmLabel={
          confirmAction?.kind === 'delete'
            ? 'Move to Trash'
            : confirmAction?.service.active
              ? 'Disable service'
              : 'Enable service'
        }
      >
        {confirmAction ? (
          <div>
            <p className="font-medium text-ink">{confirmAction.service.name}</p>
            <p>{confirmAction.service.durationMinutes} min</p>
            {confirmAction.kind === 'delete' ? (
              <div className="mt-2 space-y-1 text-ink/60">
                {confirmServiceUsage.used ? (
                  <p>
                    Used in {confirmServiceUsage.bookings} {confirmServiceUsage.bookings === 1 ? 'booking' : 'bookings'} and{' '}
                    {confirmServiceUsage.sessions} {confirmServiceUsage.sessions === 1 ? 'session' : 'sessions'}.
                  </p>
                ) : null}
                <p>Recommendation: disable the service if you only want to stop using it for new bookings.</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>

      <ServiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={dialogMode}
        service={editingService}
        onCreated={async payload => {
          const created = await createServiceRecord(payload)
          if (!created) throw new Error('Failed to create service')
        }}
        onUpdated={async payload => {
          if (!editingService) return
          const updated = await patchServiceById(editingService.id, payload)
          if (!updated) throw new Error('Failed to update service')
        }}
      />
    </div>
  )
}
