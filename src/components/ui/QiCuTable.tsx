// /components/ui/Table.tsx
'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

export function TableFrame({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-visible rounded-none', className)} {...props} />
}

export function TableEl({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('min-w-full bg-surface', className)} {...props} />
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-brand-700 text-white border-b border-brand-300/100', className)} {...props} />
}

export function TBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-brand-300/30', className)} {...props} />
}

export function Tr({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-brand-300/5', className)} {...props} />
}

export function Th({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white/90', className)}
      {...props}
    />
  )
}

export function Td({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  // BEFORE: 'px-4 py-3 text-sm text-ink bg-brand-300/10'
  return <td className={cn('px-4 py-3 text-sm text-ink', className)} {...props} />
}
