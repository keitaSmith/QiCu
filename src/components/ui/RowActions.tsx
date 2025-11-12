'use client'

import { MouseEvent } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Portal } from '@headlessui/react'
import { EllipsisVerticalIcon, EyeIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/cn'
import { ClientOnly } from '@/components/ClientOnly'

type Variant = 'default' | 'danger'
type ExtraItem = { label: string; onSelect: () => void; variant?: Variant }

type BaseProps = {
  /** Primary left text button label + handler (e.g., "Edit" or "View") */
  primaryLabel: string
  onPrimary: () => void

  /** Optional eye icon button (secondary quick view) */
  onView?: () => void

  /** Kebab extras before Delete */
  extras?: ExtraItem[]

  /** Optional delete at bottom of menu */
  onDelete?: () => void

  className?: string
}

/** Shared text action style (matches Patients “Edit”) */
const textActionBtn =
  'px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-300/15 rounded-none focus:outline-none'

/** Icon button: no focus, subtle hover */
const iconBtn =
  'p-1.5 text-brand-700 hover:bg-brand-300/10 hover:text-brand-700 rounded-none focus:outline-none'

function preventMouseFocus(e: MouseEvent) {
  e.preventDefault()
}

/** Low-level action group used by page-specific wrappers */
function ActionButtons({
  primaryLabel,
  onPrimary,
  onView,
  extras = [],
  onDelete,
  className,
}: BaseProps) {
  return (
    <div className={cn('flex items-center justify-end gap-1', className)}>
      {/* Primary text action (Edit/View text) */}
      <button type="button" onClick={onPrimary} className={textActionBtn}>
        {primaryLabel}
      </button>

      {/* Optional Eye icon */}
      {onView && (
        <button
          type="button"
          aria-label="View"
          onClick={onView}
          onMouseDown={preventMouseFocus}
          className={iconBtn}
        >
          <EyeIcon className="h-5 w-5" />
        </button>
      )}

      {/* Kebab menu */}
      <Menu as="div" className="inline-block text-left">
        <MenuButton
          onMouseDown={preventMouseFocus}
          className="
            p-1.5 text-ink/70 rounded-none focus:outline-none
            hover:bg-brand-300/10 hover:text-brand-700
            aria-expanded:bg-brand-300/10
          "
          aria-label="More actions"
        >
          <EllipsisVerticalIcon className="h-5 w-5" />
        </MenuButton>

        {/* Render the menu OUTSIDE overflow containers */}
        <ClientOnly>
          <Portal>
            <MenuItems
              anchor="bottom end"
              transition
              className="
                z-[1000] mt-2 w-44 origin-top-right rounded-md bg-surface py-2 shadow-lg outline-1 outline-ink/10
                transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in
              "
            >
              {extras.map((item) => (
                <MenuItem key={item.label}>
                  <button
                    type="button"
                    onClick={item.onSelect}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm hover:bg-brand-300/10 focus:outline-none',
                      item.variant === 'danger' ? 'text-rose-600' : 'text-ink'
                    )}
                  >
                    {item.label}
                  </button>
                </MenuItem>
              ))}

              {extras.length > 0 && onDelete && <div className="my-1 h-px bg-brand-300/30" />}

              {onDelete && (
                <MenuItem>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-brand-300/10 focus:outline-none"
                  >
                    Delete
                  </button>
                </MenuItem>
              )}
            </MenuItems>
          </Portal>
        </ClientOnly>
      </Menu>
    </div>
  )
}

/* ===============================
   Page-specific wrappers/exports
   =============================== */

/** Patients page: Edit (text) + Eye + extras: New booking, Export PDF, Archive, Delete */
export function PatientsActionButtons({
  onEdit,
  onView,
  onDelete,
  extras,
  className,
}: {
  onEdit: () => void
  onView: () => void
  onDelete: () => void
  extras?: ExtraItem[]
  className?: string
}) {
  const defaultExtras: ExtraItem[] = [
    { label: 'New booking', onSelect: () => {} },
    { label: 'Export PDF', onSelect: () => {} },
    { label: 'Archive', onSelect: () => {} },
  ]
  return (
    <ActionButtons
      primaryLabel="Edit"
      onPrimary={onEdit}
      onView={onView}
      extras={extras ?? defaultExtras}
      onDelete={onDelete}
      className={className}
    />
  )
}

/** Bookings page: View (text) + Eye + extras: Reschedule, Cancel, Set no-show, Delete */
export function BookingActionButtons({
  onView,
  onReschedule,
  onCancel,
  onNoShow,
  onDelete,
  className,
  extras,
}: {
  onView: () => void
  onReschedule?: () => void
  onCancel?: () => void
  onNoShow?: () => void
  onDelete: () => void
  extras?: ExtraItem[]
  className?: string
}) {
  const baseExtras: ExtraItem[] = [
    onReschedule && { label: 'Reschedule', onSelect: onReschedule },
    onNoShow && { label: 'Set no-show', onSelect: onNoShow },
    onCancel && { label: 'Cancel', onSelect: onCancel, variant: 'danger' },
  ].filter(Boolean) as ExtraItem[]

  const merged = extras ? [...baseExtras, ...extras] : baseExtras

  return (
    <ActionButtons
      primaryLabel="View"
      onPrimary={onView}
      onView={onView}
      extras={merged}
      onDelete={onDelete}
      className={className}
    />
  )
}
