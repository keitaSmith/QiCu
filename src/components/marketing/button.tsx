import * as Headless from '@headlessui/react'
import { cn } from '@/lib/cn'
import { Link } from './link'

const variants = {
  primary: cn(
    'inline-flex items-center justify-center px-4 py-[calc(--spacing(2)-1px)]',
    'rounded-full border border-transparent bg-[var(--color-brand-700)] shadow-md',
    'text-base font-medium whitespace-nowrap text-white',
    'data-disabled:opacity-40 data-hover:bg-[var(--color-brand-600)]',
  ),
  secondary: cn(
    'relative inline-flex items-center justify-center px-4 py-[calc(--spacing(2)-1px)]',
    'rounded-full border border-transparent bg-white/15 shadow-md ring-1 ring-[color:var(--color-brand-700)]/20',
    'after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_2px_1px_#ffffff4d]',
    'text-base font-medium whitespace-nowrap text-gray-950',
    'data-disabled:opacity-40 data-hover:bg-white/20',
  ),
  outline: cn(
    'inline-flex items-center justify-center px-2 py-[calc(--spacing(1.5)-1px)]',
    'rounded-lg border border-transparent shadow-sm ring-1 ring-black/10',
    'text-sm font-medium whitespace-nowrap text-gray-950',
    'data-disabled:opacity-40 data-hover:bg-gray-50',
  ),
}

type ButtonProps = {
  variant?: keyof typeof variants
} & (
  | React.ComponentPropsWithoutRef<typeof Link>
  | (Headless.ButtonProps & { href?: undefined })
)

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  if (typeof props.href === 'undefined') {
    return (
      <Headless.Button
        {...props}
        className={(bag) =>
          cn(
            typeof className === 'function' ? className(bag) : className,
            variants[variant],
          )
        }
      />
    )
  }

  return <Link {...props} className={cn(className as string | undefined, variants[variant])} />
}
