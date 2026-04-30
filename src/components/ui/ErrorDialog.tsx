'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

type ErrorDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  message: string
}

export function ErrorDialog({ open, onClose, title, message }: ErrorDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel className="mx-auto w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl ring-1 ring-black/5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-300/20 text-brand-700">
                <ExclamationTriangleIcon aria-hidden="true" className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold text-ink">{title}</DialogTitle>
                <p className="mt-2 text-sm leading-6 text-ink/70">{message}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none"
              >
                OK
              </button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
