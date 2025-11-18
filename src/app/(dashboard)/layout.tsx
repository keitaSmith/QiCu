// app/(dashboard)/layout.tsx
'use client'

import { SnackbarProvider } from '@/components/ui/Snackbar'
import { useState, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  TransitionChild,
} from '@headlessui/react'
import { RightPanelContext } from '@/components/layout/RightPanelContext'
import {
  Bars3Icon,
  BellIcon,
  CalendarIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  DocumentDuplicateIcon,
  FolderIcon,
  HomeIcon,
  UsersIcon,
  UserGroupIcon,
  XMarkIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon 
} from '@heroicons/react/24/outline'
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'

// ✨ Framer Motion
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'

const navigation = [
  { name: 'Patients', href: '/dashboard/patients', icon: UserGroupIcon },
  { name: 'Bookings', href: '/dashboard/bookings', icon: CalendarDaysIcon },
  { name: 'Sessions', href: '/dashboard/sessions', icon: ClipboardDocumentCheckIcon  },
  { name: 'Team', href: '/dashboard/team', icon: UsersIcon },
  { name: 'Projects', href: '/dashboard/projects', icon: FolderIcon },
  { name: 'Calendar', href: '/dashboard/calendar', icon: CalendarIcon },
  { name: 'Documents', href: '/dashboard/documents', icon: DocumentDuplicateIcon },
  { name: 'Reports', href: '/dashboard/reports', icon: ChartPieIcon },
]

const teams = [
  { id: 1, name: 'Heroicons', href: '#', initial: 'H' },
  { id: 2, name: 'Tailwind Labs', href: '#', initial: 'T' },
  { id: 3, name: 'Workcation', href: '#', initial: 'W' },
]

const userNavigation = [
  { name: 'Your profile', href: '#' },
  { name: 'Sign out', href: '#' },
]


function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()
  const showRightPanel = [
  '/dashboard/patients',
  '/dashboard/sessions',
  '/dashboard/bookings',
].includes(pathname)
  const [rightPanelContent, setRightPanelContent] = useState<ReactNode | null>(null)
  return (
    <SnackbarProvider>
    <div>
      <RightPanelContext.Provider value={{ setRightPanelContent }}>
      {/* MOBILE SIDEBAR */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-ink/60 transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-surface" />
                </button>
              </div>
            </TransitionChild>

            {/* Sidebar content (mobile) */}
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-surface px-6 pb-4">
              <div className="flex h-16 shrink-0 items-center">
                <img
                  alt="Your Company"
                  src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=086e89&shade=600"
                  className="h-8 w-auto"
                />
              </div>

              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {navigation.map((item) => {
                        const active = pathname === item.href
                        return (
                          <li key={item.name}>
                            <Link
                              href={item.href}
                              className={classNames(
                                active
                                  ? 'bg-brand-300/15 text-brand-700'
                                  : 'text-ink hover:bg-brand-300/10 hover:text-brand-600',
                                'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold'
                              )}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <item.icon
                                aria-hidden="true"
                                className={classNames(
                                  active ? 'text-brand-700' : 'text-ink/50 group-hover:text-brand-600',
                                  'size-6 shrink-0'
                                )}
                              />
                              {item.name}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </li>

                  <li>
                    <div className="text-xs/6 font-semibold text-ink/60">Your teams</div>
                    <ul role="list" className="-mx-2 mt-2 space-y-1">
                      {teams.map((team) => (
                        <li key={team.name}>
                          <a
                            href={team.href}
                            className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-ink hover:bg-brand-300/10 hover:text-brand-600"
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-brand-300/50 bg-surface text-[0.625rem] font-medium text-ink/50 group-hover:border-brand-600/60 group-hover:text-brand-600">
                              {team.initial}
                            </span>
                            <span className="truncate">{team.name}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>

                  <li className="mt-auto">
                    <a
                      href="#"
                      className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-ink hover:bg-brand-300/10 hover:text-brand-600"
                    >
                      <Cog6ToothIcon aria-hidden="true" className="size-6 shrink-0 text-ink/50 group-hover:text-brand-600" />
                      Settings
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* DESKTOP SIDEBAR */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-brand-300/30 bg-surface px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <img
              alt="Your Company"
              src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=086e89&shade=600"
              className="h-8 w-auto"
            />
            <h1 className="ml-2 text-xl font-semibold text-ink">QI-CU</h1>
          </div>

          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => {
                    const active = pathname === item.href
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={classNames(
                            active
                              ? 'bg-brand-300/15 text-brand-700'
                              : 'text-ink hover:bg-brand-300/10 hover:text-brand-600',
                            'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold'
                          )}
                        >
                          <item.icon
                            aria-hidden="true"
                            className={classNames(
                              active ? 'text-brand-700' : 'text-ink/50 group-hover:text-brand-600',
                              'size-6 shrink-0'
                            )}
                          />
                          {item.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>

              <li>
                <div className="text-xs/6 font-semibold text-ink/60">Your teams</div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {teams.map((team) => (
                    <li key={team.name}>
                      <a
                        href={team.href}
                        className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-ink hover:bg-brand-300/10 hover:text-brand-600"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-brand-300/50 bg-surface text-[0.625rem] font-medium text-ink/50 group-hover:border-brand-600/60 group-hover:text-brand-600">
                          {team.initial}
                        </span>
                        <span className="truncate">{team.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>

              <li className="mt-auto">
                <a
                  href="#"
                  className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-ink hover:bg-brand-300/10 hover:text-brand-600"
                >
                  <Cog6ToothIcon aria-hidden="true" className="size-6 shrink-0 text-ink/50 group-hover:text-brand-600" />
                  Settings
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* MAIN REGION (reserves left sidebar) */}
      <div className="lg:pl-72 bg-surface">
        {/* FULL-WIDTH TOP BAR spanning center + right column */}
        <header className="sticky top-0 z-40 bg-surface border-b border-brand-300/30 shadow-xs px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-x-4 sm:gap-x-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-m-2.5 rounded-md p-2.5 text-ink hover:bg-brand-300/10 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600 lg:hidden"
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>

            {/* Separator on mobile */}
            <div aria-hidden="true" className="h-6 w-px bg-brand-300/30 lg:hidden" />

            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              {/* Search */}
              <form action="#" method="GET" className="grid flex-1 grid-cols-1">
                <input
                  name="search"
                  placeholder="Search"
                  aria-label="Search"
                  className="col-start-1 row-start-1 block size-full bg-surface pl-8 text-base text-ink outline-hidden placeholder:text-ink/50 sm:text-sm/6"
                />
                <MagnifyingGlassIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 size-5 self-center text-ink/40"
                />
              </form>

              <div className="ml-auto flex items-center gap-x-4 lg:gap-x-6">
                <button
                  type="button"
                  className="-m-2.5 rounded-md p-2.5 text-ink/60 hover:bg-brand-300/10 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <span className="sr-only">View notifications</span>
                  <BellIcon aria-hidden="true" className="size-6" />
                </button>

                <div aria-hidden="true" className="hidden lg:block lg:h-6 lg:w-px lg:bg-brand-300/30" />

                {/* Profile dropdown */}
                <Menu as="div" className="relative">
                  <MenuButton className="relative flex items-center rounded-md p-0.5 hover:bg-brand-300/10 focus:outline-none focus:ring-2 focus:ring-brand-600">
                    <span className="absolute -inset-1.5" />
                    <span className="sr-only">Open user menu</span>
                    <img
                      alt=""
                      src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                      className="size-8 rounded-full bg-canvas outline -outline-offset-1 outline-ink/10"
                    />
                    <span className="hidden lg:flex lg:items-center">
                      <span aria-hidden="true" className="ml-4 text-sm/6 font-semibold text-ink">
                        Tom Cook
                      </span>
                      <ChevronDownIcon aria-hidden="true" className="ml-2 size-5 text-ink/50" />
                    </span>
                  </MenuButton>
                  <MenuItems
                    transition
                    className="absolute right-0 z-50 mt-2.5 w-36 origin-top-right rounded-md bg-surface py-2 shadow-lg outline-1 outline-ink/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                  >
                    {userNavigation.map((item) => (
                      <MenuItem key={item.name}>
                        <a
                          href={item.href}
                          className="block px-3 py-1 text-sm/6 text-ink data-focus:bg-brand-300/10 data-focus:outline-hidden"
                        >
                          {item.name}
                        </a>
                      </MenuItem>
                    ))}
                  </MenuItems>
                </Menu>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT (constrained), keeps space for right column on xl+ */}
        <main className="py-10">
          <div className="xl:pr-96">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {/* ✨ Route/page transition + shared-element host */}
              <LayoutGroup id="dashboard">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </LayoutGroup>
            </div>
          </div>
        </main>
      </div>

      {/* RIGHT COLUMN (third column) */}
      
        <div className="min-h-screen bg-surface text-ink">
          {/* existing nav / shell / main content stays as-is */}
          {/* ... */}

          {/* Your existing main content wrapper around {children} */}
          {/* e.g. something like: */}
          {/* <div className="lg:pl-72">
               <main> {children} </main>
              </div> */}

          {/* RIGHT COLUMN (third column) */}
          {showRightPanel && (
  <aside className="fixed top-16 bottom-0 right-0 hidden w-80 overflow-y-auto border-l border-brand-300/30 bg-surface px-4 py-6 sm:px-6 lg:px-8 xl:block z-30">
    {rightPanelContent ? (
      <div className="space-y-4">
        {rightPanelContent}
      </div>
    ) : (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Details</h2>
        <div className="rounded-2xl border border-brand-300/30 bg-surface p-4">
          <p className="text-sm text-ink/70">
            Select a patient, booking, or session to see details here.
          </p>
        </div>
      </div>
    )}
  </aside>
)}
        </div>
      </RightPanelContext.Provider>
      </div>
    </SnackbarProvider>
  )
}
