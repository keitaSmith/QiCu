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
import type { Service } from '@/models/service'

export default function ServicesPage() {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { setRightPanelContent } = useRightPanel()
  const { services, loading, error, createServiceRecord, patchServiceById, deleteServiceById } = useServices()

  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingService, setEditingService] = useState<Service | null>(null)

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

  async function handleDelete(service: Service) {
    if (!window.confirm(`Delete ${service.name} ${service.durationMinutes} min?`)) return
    await deleteServiceById(service.id)
    if (isDesktop) setRightPanelContent(null)
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
                      onDelete={() => handleDelete(service)}
                      extras={[
                        { label: 'Edit service', onSelect: () => handleEdit(service) },
                        {
                          label: service.active ? 'Disable service' : 'Enable service',
                          onSelect: () => handleToggleActive(service),
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
                onDelete={() => handleDelete(service)}
                extras={[
                  { label: 'Edit service', onSelect: () => handleEdit(service) },
                  {
                    label: service.active ? 'Disable service' : 'Enable service',
                    onSelect: () => handleToggleActive(service),
                  },
                ]}
              />
            </div>
          </article>
        ))}
      </div>

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
