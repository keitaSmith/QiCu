'use client'

import { Tr, Td } from '@/components/ui/QiCuTable'

type TableSkeletonProps = {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  const widths = ['w-1/4', 'w-1/3', 'w-1/2', 'w-2/3', 'w-3/4', 'w-full']
  const opacities = ['opacity-60', 'opacity-70', 'opacity-80', 'opacity-90']

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Tr key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => {
            // 🔹 deterministically "pseudo-random" seed per cell
            const seed = rowIndex * 17 + colIndex * 31

            const widthIndex = seed % widths.length
            const opacityIndex = (seed >> 1) % opacities.length

            const w = widths[widthIndex]
            const o = opacities[opacityIndex]

            return (
              <Td key={colIndex}>
                <div
                  className={[
                    'h-4 rounded-md',
                    'bg-brand-300/50',
                    'animate-pulse',
                    w,
                    o,
                  ].join(' ')}
                />
              </Td>
            )
          })}
        </Tr>
      ))}
    </>
  )
}
