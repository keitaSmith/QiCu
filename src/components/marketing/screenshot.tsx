import { cn } from '@/lib/cn'

export function ScreenshotFrame({
  width,
  height,
  className,
  children,
}: {
  width: number
  height: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{ '--width': width, '--height': height } as React.CSSProperties}
      className={cn(
        className,
        'relative aspect-[var(--width)/var(--height)] [--radius:var(--radius-xl)]',
      )}
    >
      <div className="absolute -inset-(--padding) rounded-[calc(var(--radius)+var(--padding))] shadow-xs ring-1 ring-black/5 [--padding:--spacing(2)]" />
      <div className="h-full overflow-hidden rounded-(--radius) shadow-2xl ring-1 ring-black/10">
        {children}
      </div>
    </div>
  )
}
