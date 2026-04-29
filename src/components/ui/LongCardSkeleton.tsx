'use client'

type LongCardSkeletonProps = {
  sections?: number
  showHeader?: boolean
  showFooter?: boolean
}

export function LongCardSkeleton({
  sections = 1,
  showHeader = true,
  showFooter = true,
}: LongCardSkeletonProps) {
  return (
    <div className="space-y-4 rounded-xl border border-brand-300/30 bg-brand-50/40 p-4">
      {showHeader && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-brand-300/50 animate-pulse" />
            <div className="h-4 w-64 rounded bg-brand-300/35 animate-pulse" />
          </div>
          <div className="h-10 w-36 rounded-lg bg-brand-300/40 animate-pulse" />
        </div>
      )}

      {Array.from({ length: sections }).map((_, index) => (
        <div key={index} className="grid gap-3 lg:grid-cols-4 lg:items-end">
          <div className="space-y-2 lg:col-span-2">
            <div className="h-4 w-20 rounded bg-brand-300/40 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-brand-300/30 animate-pulse" />
          </div>

          <div className="space-y-2">
            <div className="h-4 w-12 rounded bg-brand-300/40 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-brand-300/30 animate-pulse" />
          </div>

          <div className="space-y-2">
            <div className="h-4 w-8 rounded bg-brand-300/40 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-brand-300/30 animate-pulse" />
          </div>
        </div>
      ))}

      {showFooter && (
        <div className="flex justify-end">
          <div className="h-10 w-44 rounded-lg bg-brand-300/40 animate-pulse" />
        </div>
      )}
    </div>
  )
}
