'use client'

type CardListSkeletonProps = {
  items?: number
  lines?: number
  showBadge?: boolean
  showActions?: boolean
}

export function CardListSkeleton({
  items = 3,
  lines = 3,
  showBadge = true,
  showActions = true,
}: CardListSkeletonProps) {
  const widths = ['w-20', 'w-24', 'w-28', 'w-32', 'w-40', 'w-48', 'w-56', 'w-64']

  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, index) => (
        <div
          key={index}
          className="rounded-xl border border-brand-300/40 bg-surface p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div
                className={`h-5 rounded-md bg-brand-300/50 animate-pulse ${widths[index % widths.length]}`}
              />
              {Array.from({ length: lines }).map((__, lineIndex) => (
                <div
                  key={lineIndex}
                  className={`mt-2 h-3 rounded-md bg-brand-300/${40 - Math.min(lineIndex, 2) * 10} animate-pulse ${widths[(index + lineIndex + 2) % widths.length]}`}
                />
              ))}
            </div>

            {showBadge && (
              <div className="h-6 w-16 shrink-0 rounded-full bg-brand-300/40 animate-pulse" />
            )}
          </div>

          {showActions && (
            <div className="mt-4 flex justify-end gap-2">
              <div className="h-8 w-20 rounded-lg bg-brand-300/30 animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-brand-300/40 animate-pulse" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
