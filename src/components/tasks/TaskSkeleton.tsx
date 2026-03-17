'use client'

type TaskSkeletonProps = {
  items?: number
}

export function TaskSkeleton({ items = 3 }: TaskSkeletonProps) {
  const widths = ['w-24', 'w-32', 'w-40', 'w-48', 'w-56', 'w-64']

  return (
    <div className="max-h-[26rem] overflow-y-auto">
      {Array.from({ length: items }).map((_, index) => {
        const titleWidth = widths[index % widths.length]
        const subWidth = widths[(index + 2) % widths.length]
        const metaWidth = widths[(index + 4) % widths.length]

        return (
          <div
            key={index}
            className="mx-2 my-2 rounded-2xl border border-brand-300/30 bg-surface p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className={`h-4 rounded-md bg-brand-300/50 animate-pulse ${titleWidth}`} />
                <div className={`mt-2 h-3 rounded-md bg-brand-300/40 animate-pulse ${subWidth}`} />
                <div className={`mt-2 h-3 rounded-md bg-brand-300/30 animate-pulse ${metaWidth}`} />
              </div>
              <div className="h-6 w-14 shrink-0 rounded-full bg-brand-300/40 animate-pulse" />
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <div className="h-8 w-24 rounded-lg bg-brand-300/40 animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-brand-300/30 animate-pulse" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
