'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type SnackbarVariant = 'success' | 'error' | 'info'

type SnackbarOptions = {
  message: string
  variant?: SnackbarVariant
  /** Optional button label, e.g. "View sessions" */
  actionLabel?: string
  onAction?: () => void
}

type SnackbarState = SnackbarOptions & { id: number }

type SnackbarContextValue = {
  showSnackbar: (opts: SnackbarOptions) => void
}

const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined)

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext)
  if (!ctx) {
    throw new Error('useSnackbar must be used within a SnackbarProvider')
  }
  return ctx
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showSnackbar = useCallback((opts: SnackbarOptions) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    const next: SnackbarState = {
      id: Date.now(),
      variant: opts.variant ?? 'info',
      message: opts.message,
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
    }

    setSnackbar(next)

    timeoutRef.current = setTimeout(() => {
      setSnackbar(null)
      timeoutRef.current = null
    }, 4000)
  }, [])

  const bgByVariant: Record<SnackbarVariant, string> = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-slate-800 text-white',
  }

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}

      {/* Snackbar overlay – bottom center */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:px-0">
        {snackbar && (
          <div
            className={[
              'pointer-events-auto inline-flex max-w-lg items-center gap-3 rounded-xl px-4 py-3 shadow-lg shadow-black/30',
              bgByVariant[snackbar.variant ?? 'info'],
            ].join(' ')}
          >
            <p className="text-sm font-medium">{snackbar.message}</p>
            {snackbar.actionLabel && snackbar.onAction && (
              <button
                type="button"
                onClick={snackbar.onAction}
                className="ml-2 rounded-md border border-white/30 px-2 py-1 text-xs font-semibold hover:bg-white/10"
              >
                {snackbar.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </SnackbarContext.Provider>
  )
}
