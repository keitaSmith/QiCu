
'use client'

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisHorizontalIcon } from '@heroicons/react/20/solid'
import type { CalendarView } from '@/lib/calendar'
import { cn } from '@/lib/cn'

const VIEW_LABELS: Record<CalendarView, string> = {
  day: 'Day view',
  week: 'Week view',
  month: 'Month view',
  year: 'Year view',
}

type Props = {
  view: CalendarView
  title: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: CalendarView) => void
  onNewBooking: () => void
}

export function CalendarToolbar({ view, title, onPrev, onNext, onToday, onViewChange, onNewBooking }: Props) {
  const viewOptions = (Object.keys(VIEW_LABELS) as CalendarView[])

  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-brand-300/30 bg-surface px-4 py-4 shadow-sm sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink/60">{title}</p>
        </div>

        <div className="hidden md:flex md:items-center md:gap-3">
          <div className="inline-flex items-center rounded-lg border border-brand-300/40 bg-canvas/40 shadow-sm">
            <button type="button" onClick={onPrev} className="rounded-l-lg px-3 py-2 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700">
              <ChevronLeftIcon className="size-5" />
            </button>
            <button type="button" onClick={onToday} className="border-x border-brand-300/40 px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 hover:text-brand-700">
              Today
            </button>
            <button type="button" onClick={onNext} className="rounded-r-lg px-3 py-2 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700">
              <ChevronRightIcon className="size-5" />
            </button>
          </div>

          <Menu as="div" className="relative">
            <MenuButton className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300/40 bg-surface px-3 py-2 text-sm font-medium text-ink shadow-sm hover:bg-brand-300/10">
              {VIEW_LABELS[view]}
              <ChevronDownIcon className="size-5 text-ink/50" />
            </MenuButton>
            <MenuItems className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-brand-300/30 bg-surface p-1 shadow-lg outline-none">
              {viewOptions.map(option => (
                <MenuItem key={option}>
                  <button
                    type="button"
                    onClick={() => onViewChange(option)}
                    className={cn(
                      'block w-full rounded-lg px-3 py-2 text-left text-sm text-ink data-focus:bg-brand-300/15',
                      option === view && 'bg-brand-300/15 text-brand-700',
                    )}
                  >
                    {VIEW_LABELS[option]}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>

          <button type="button" onClick={onNewBooking} className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600">
            New Booking
          </button>
        </div>

        <div className="md:hidden">
          <Menu as="div" className="relative">
            <MenuButton className="rounded-full p-2 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700">
              <EllipsisHorizontalIcon className="size-5" />
            </MenuButton>
            <MenuItems className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-brand-300/30 bg-surface p-1 shadow-lg outline-none">
              <MenuItem>
                <button type="button" onClick={onNewBooking} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink data-focus:bg-brand-300/15">
                  New Booking
                </button>
              </MenuItem>
              <MenuItem>
                <button type="button" onClick={onToday} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink data-focus:bg-brand-300/15">
                  Go to today
                </button>
              </MenuItem>
              {viewOptions.map(option => (
                <MenuItem key={option}>
                  <button
                    type="button"
                    onClick={() => onViewChange(option)}
                    className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm text-ink data-focus:bg-brand-300/15', option === view && 'bg-brand-300/15 text-brand-700')}
                  >
                    {VIEW_LABELS[option]}
                  </button>
                </MenuItem>
              ))}
            </MenuItems>
          </Menu>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="inline-flex items-center rounded-lg border border-brand-300/40 bg-canvas/40 shadow-sm">
          <button type="button" onClick={onPrev} className="rounded-l-lg px-3 py-2 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700">
            <ChevronLeftIcon className="size-5" />
          </button>
          <button type="button" onClick={onToday} className="border-x border-brand-300/40 px-3 py-2 text-sm font-medium text-ink hover:bg-brand-300/10 hover:text-brand-700">
            Today
          </button>
          <button type="button" onClick={onNext} className="rounded-r-lg px-3 py-2 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700">
            <ChevronRightIcon className="size-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
