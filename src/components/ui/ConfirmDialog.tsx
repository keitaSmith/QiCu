'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  loading?: boolean
  confirmDisabled?: boolean
  children?: ReactNode
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const destructive = variant === 'destructive'

  return (
    <Dialog open={open} onClose={loading ? () => {} : onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="flex items-start gap-4">
              <div
                className={
                  destructive
                    ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700'
                    : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300/20 text-brand-700'
                }
              >
                {destructive ? (
                  <ExclamationTriangleIcon aria-hidden="true" className="h-6 w-6" />
                ) : (
                  <InformationCircleIcon aria-hidden="true" className="h-6 w-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold text-ink">{title}</DialogTitle>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/70">{description}</p>
                {children ? (
                  <div className="mt-4 rounded-xl border border-brand-300/30 bg-canvas/35 p-4 text-sm text-ink/75">
                    {children}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-md border border-brand-300/50 bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={loading || confirmDisabled}
                onClick={() => {
                  if (!confirmDisabled) void onConfirm()
                }}
                className={
                  destructive
                    ? 'rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-70'
                    : 'rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-70'
                }
              >
                {loading ? 'Working...' : confirmLabel}
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
