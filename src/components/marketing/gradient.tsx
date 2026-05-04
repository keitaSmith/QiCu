import { cn } from '@/lib/cn'

const brandGradient =
  'bg-linear-115 from-[#d9f3f1] from-28% via-[#73c2bd] via-70% to-[#086e89] sm:bg-linear-145'

export function Gradient({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={cn(className, brandGradient)} />
}

export function GradientBackground() {
  return (
    <div className="relative mx-auto max-w-7xl">
      <div
        className={cn(
          'absolute -top-44 -right-60 h-60 w-xl transform-gpu md:right-0',
          'bg-linear-115 from-[#d9f3f1] from-28% via-[#73c2bd] via-70% to-[#086e89]',
          'rotate-[-10deg] rounded-full blur-3xl',
        )}
      />
    </div>
  )
}
