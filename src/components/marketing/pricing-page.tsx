import { CheckIcon, ChevronUpDownIcon, MinusIcon } from '@heroicons/react/16/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Button } from './button'
import { Container } from './container'
import { Footer } from './footer'
import { Gradient, GradientBackground } from './gradient'
import { Link } from './link'
import { Navbar } from './navbar'
import { Heading, Lead, Subheading } from './text'

const tiers = [
  {
    name: 'Starter' as const,
    slug: 'starter',
    description: 'For solo practitioners getting organized.',
    priceLabel: 'Coming soon',
    href: '/dashboard',
    highlights: [
      { description: 'Patient management' },
      { description: 'Booking management' },
      { description: 'Services' },
      { description: 'Session notes' },
      { description: 'Basic task workflow' },
    ],
    features: [
      { section: 'Workflow', name: 'Patient management', value: true },
      { section: 'Workflow', name: 'Booking management', value: true },
      { section: 'Workflow', name: 'Services', value: true },
      { section: 'Workflow', name: 'Session notes', value: true },
      { section: 'Workflow', name: 'Task workflow', value: 'Basic' },
      { section: 'Calendar', name: 'Google Calendar import', value: false },
      { section: 'Calendar', name: 'Google Calendar sync', value: false },
      { section: 'Calendar', name: 'Review before import', value: false },
      { section: 'Support', name: 'Early access availability', value: true },
      { section: 'Support', name: 'Migration planning', value: false },
      { section: 'Support', name: 'Workflow customization', value: false },
    ],
  },
  {
    name: 'Professional' as const,
    slug: 'professional',
    description: 'For growing practices.',
    priceLabel: 'Early access',
    href: '/dashboard',
    highlights: [
      { description: 'Everything in Starter' },
      { description: 'Google Calendar import and sync' },
      { description: 'More advanced workflow support' },
      { description: 'Better visibility across bookings and notes' },
      { description: 'Organized practice overview' },
    ],
    features: [
      { section: 'Workflow', name: 'Patient management', value: true },
      { section: 'Workflow', name: 'Booking management', value: true },
      { section: 'Workflow', name: 'Services', value: true },
      { section: 'Workflow', name: 'Session notes', value: true },
      { section: 'Workflow', name: 'Task workflow', value: 'Expanded' },
      { section: 'Calendar', name: 'Google Calendar import', value: true },
      { section: 'Calendar', name: 'Google Calendar sync', value: true },
      { section: 'Calendar', name: 'Review before import', value: true },
      { section: 'Support', name: 'Early access availability', value: true },
      { section: 'Support', name: 'Migration planning', value: false },
      { section: 'Support', name: 'Workflow customization', value: false },
    ],
  },
  {
    name: 'Custom' as const,
    slug: 'custom',
    description: 'For clinics or special workflows.',
    priceLabel: 'By conversation',
    href: '/dashboard',
    highlights: [
      { description: 'Custom setup' },
      { description: 'Migration support' },
      { description: 'Integration planning' },
      { description: 'Workflow customization' },
      { description: 'Designed around practice needs' },
    ],
    features: [
      { section: 'Workflow', name: 'Patient management', value: true },
      { section: 'Workflow', name: 'Booking management', value: true },
      { section: 'Workflow', name: 'Services', value: true },
      { section: 'Workflow', name: 'Session notes', value: true },
      { section: 'Workflow', name: 'Task workflow', value: 'Custom' },
      { section: 'Calendar', name: 'Google Calendar import', value: true },
      { section: 'Calendar', name: 'Google Calendar sync', value: true },
      { section: 'Calendar', name: 'Review before import', value: true },
      { section: 'Support', name: 'Early access availability', value: true },
      { section: 'Support', name: 'Migration planning', value: true },
      { section: 'Support', name: 'Workflow customization', value: true },
    ],
  },
]

const faqs = [
  {
    question: 'Is QiCu for solo practitioners?',
    answer:
      'Yes. QiCu is designed for small practices and solo practitioners who want a clearer way to manage patients, bookings, notes, and follow-up tasks.',
  },
  {
    question: 'Can I manage patients and bookings?',
    answer:
      'Yes. QiCu includes patient management, booking management, service details, and booking statuses.',
  },
  {
    question: 'Can I create session notes?',
    answer:
      'Yes. Sessions can be linked to patients and, when useful, connected to bookings.',
  },
  {
    question: 'Can QiCu connect with Google Calendar?',
    answer:
      'QiCu is being developed with Google Calendar workflows in mind, including importing appointments and syncing QiCu bookings back to Google Calendar.',
  },
  {
    question: 'Can I import old appointments?',
    answer:
      'The import flow is designed to preview calendar events before adding them to QiCu, so practitioners can review what should or should not be imported.',
  },
  {
    question: 'Is QiCu still in development?',
    answer:
      'Yes. QiCu is actively being developed, with the focus on clear workflows for small healthcare and wellness practices.',
  },
]

function Header() {
  return (
    <Container className="mt-16">
      <Heading as="h1">Simple plans for organized practice management.</Heading>
      <Lead className="mt-6 max-w-3xl">
        QiCu is being shaped for solo practitioners, growing practices, and custom workflows that need a clearer way to manage patients, bookings, notes, and calendar work.
      </Lead>
    </Container>
  )
}

function PricingCards() {
  return (
    <div className="relative py-24">
      <Gradient className="absolute inset-x-2 top-48 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
      <Container className="relative">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {tiers.map((tier, tierIndex) => (
            <PricingCard key={tierIndex} tier={tier} />
          ))}
        </div>
      </Container>
    </div>
  )
}

function PricingCard({ tier }: { tier: (typeof tiers)[number] }) {
  return (
    <div className="-m-2 grid grid-cols-1 rounded-4xl shadow-[inset_0_0_2px_1px_#ffffff4d] ring-1 ring-black/5 max-lg:mx-auto max-lg:w-full max-lg:max-w-md">
      <div className="grid grid-cols-1 rounded-4xl p-2 shadow-md shadow-black/5">
        <div className="rounded-3xl bg-white p-10 pb-9 shadow-2xl ring-1 ring-black/5">
          <Subheading>{tier.name}</Subheading>
          <p className="mt-2 text-sm/6 text-gray-950/75">{tier.description}</p>
          <div className="mt-8">
            <div className="text-4xl font-medium text-gray-950">{tier.priceLabel}</div>
            <div className="mt-2 text-sm/5 text-gray-950/75">
              Provisional pricing direction while QiCu is still in active development.
            </div>
          </div>
          <div className="mt-8">
            <Button href={tier.href}>Open Dashboard</Button>
          </div>
          <div className="mt-8">
            <h3 className="text-sm/6 font-medium text-gray-950">
              Includes:
            </h3>
            <ul className="mt-3 space-y-3">
              {tier.highlights.map((props, featureIndex) => (
                <FeatureItem key={featureIndex} {...props} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function PricingTable({
  selectedTier,
}: {
  selectedTier: (typeof tiers)[number]
}) {
  return (
    <Container className="py-24">
      <table className="w-full text-left">
        <caption className="sr-only">Pricing plan comparison</caption>
        <colgroup>
          <col className="w-3/5 sm:w-2/5" />
          <col
            data-selected={selectedTier === tiers[0] ? true : undefined}
            className="w-2/5 data-selected:table-column max-sm:hidden sm:w-1/5"
          />
          <col
            data-selected={selectedTier === tiers[1] ? true : undefined}
            className="w-2/5 data-selected:table-column max-sm:hidden sm:w-1/5"
          />
          <col
            data-selected={selectedTier === tiers[2] ? true : undefined}
            className="w-2/5 data-selected:table-column max-sm:hidden sm:w-1/5"
          />
        </colgroup>
        <thead>
          <tr className="max-sm:hidden">
            <td className="p-0" />
            {tiers.map((tier) => (
              <th
                key={tier.slug}
                scope="col"
                data-selected={selectedTier === tier ? true : undefined}
                className="p-0 data-selected:table-cell max-sm:hidden"
              >
                <Subheading as="div">{tier.name}</Subheading>
              </th>
            ))}
          </tr>
          <tr className="sm:hidden">
            <td className="p-0">
              <div className="relative inline-block">
                <div>
                  <Menu>
                    <MenuButton className="flex items-center justify-between gap-2 font-medium">
                      {selectedTier.name}
                      <ChevronUpDownIcon className="size-4 fill-gray-900" />
                    </MenuButton>
                    <MenuItems
                      anchor="bottom start"
                      className="min-w-(--button-width) rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200 [--anchor-gap:6px] [--anchor-offset:-4px] [--anchor-padding:10px]"
                    >
                      {tiers.map((tier) => (
                        <MenuItem key={tier.slug}>
                          <Link
                            scroll={false}
                            href={`/pricing?tier=${tier.slug}`}
                            data-selected={tier === selectedTier ? true : undefined}
                            className="group flex items-center gap-2 rounded-md px-2 py-1 data-focus:bg-gray-200"
                          >
                            {tier.name}
                            <CheckIcon className="hidden size-4 group-data-selected:block" />
                          </Link>
                        </MenuItem>
                      ))}
                    </MenuItems>
                  </Menu>
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center">
                  <ChevronUpDownIcon className="size-4 fill-gray-900" />
                </div>
              </div>
            </td>
            <td colSpan={3} className="p-0 text-right">
              <Button variant="outline" href={selectedTier.href}>
                Open Dashboard
              </Button>
            </td>
          </tr>
          <tr className="max-sm:hidden">
            <th className="p-0" scope="row">
              <span className="sr-only">Get started</span>
            </th>
            {tiers.map((tier) => (
              <td
                key={tier.slug}
                data-selected={selectedTier === tier ? true : undefined}
                className="px-0 pt-4 pb-0 data-selected:table-cell max-sm:hidden"
              >
                <Button variant="outline" href={tier.href}>
                  Open Dashboard
                </Button>
              </td>
            ))}
          </tr>
        </thead>
        {[...new Set(tiers[0].features.map(({ section }) => section))].map(
          (section) => (
            <tbody key={section} className="group">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="px-0 pt-10 pb-0 group-first-of-type:pt-5"
                >
                  <div className="-mx-4 rounded-lg bg-gray-50 px-4 py-3 text-sm/6 font-semibold">
                    {section}
                  </div>
                </th>
              </tr>
              {tiers[0].features
                .filter((feature) => feature.section === section)
                .map(({ name }) => (
                  <tr
                    key={name}
                    className="border-b border-gray-100 last:border-none"
                  >
                    <th
                      scope="row"
                      className="px-0 py-4 text-sm/6 font-normal text-gray-600"
                    >
                      {name}
                    </th>
                    {tiers.map((tier) => {
                      const value = tier.features.find(
                        (feature) =>
                          feature.section === section && feature.name === name,
                      )?.value

                      return (
                        <td
                          key={tier.slug}
                          data-selected={selectedTier === tier ? true : undefined}
                          className="p-4 data-selected:table-cell max-sm:hidden"
                        >
                          {value === true ? (
                            <>
                              <CheckIcon className="size-4 fill-[var(--color-brand-700)]" />
                              <span className="sr-only">
                                Included in {tier.name}
                              </span>
                            </>
                          ) : value === false || value === undefined ? (
                            <>
                              <MinusIcon className="size-4 fill-gray-400" />
                              <span className="sr-only">
                                Not included in {tier.name}
                              </span>
                            </>
                          ) : (
                            <div className="text-sm/6">{value}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
            </tbody>
          ),
        )}
      </table>
    </Container>
  )
}

function FeatureItem({
  description,
  disabled = false,
}: {
  description: string
  disabled?: boolean
}) {
  return (
    <li
      data-disabled={disabled ? true : undefined}
      className="flex items-start gap-4 text-sm/6 text-gray-950/75 data-disabled:text-gray-950/25"
    >
      <span className="inline-flex h-6 items-center">
        <PlusIcon className="size-3.75 shrink-0 fill-gray-950/25" />
      </span>
      {disabled ? <span className="sr-only">Not included:</span> : null}
      {description}
    </li>
  )
}

function PlusIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 15 15" aria-hidden="true" {...props}>
      <path clipRule="evenodd" d="M8 0H7v7H0v1h7v7h1V8h7V7H8V0z" />
    </svg>
  )
}

function CustomWorkflowSection() {
  return (
    <div className="mx-2 my-24 rounded-4xl bg-gray-900 pt-72 pb-24 lg:pt-36">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-[384px_1fr_1fr]">
          <div className="-mt-96 lg:-mt-52">
            <div className="-m-2 rounded-4xl bg-white/15 shadow-[inset_0_0_2px_1px_#ffffff4d] ring-1 ring-black/5 max-lg:mx-auto max-lg:max-w-xs">
              <div className="rounded-4xl p-2 shadow-md shadow-black/5">
                <div className="aspect-3/4 rounded-3xl bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.75),transparent_35%),linear-gradient(180deg,#102022_0%,#0a4e61_100%)] p-8 shadow-2xl outline outline-1 -outline-offset-1 outline-black/10">
                  <div className="grid h-full gap-4 rounded-2xl border border-white/10 bg-white/8 p-5">
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Custom setup</div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Migration support</div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Integration planning</div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Workflow customization</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex max-lg:mt-16 lg:col-span-2 lg:px-16">
            <figure className="mx-auto flex max-w-xl flex-col gap-16 max-lg:text-center">
              <blockquote>
                <p className="relative text-3xl tracking-tight text-white lg:text-4xl">
                  Need a setup that fits a specific workflow? QiCu is being shaped with room for custom practice needs, migration planning, and calendar-aware ways of working.
                </p>
              </blockquote>
              <figcaption className="mt-auto">
                <p className="text-sm/6 font-medium text-white">Custom direction</p>
                <p className="text-sm/6 font-medium">
                  <span className="bg-linear-to-r from-[#d9f3f1] from-28% via-[#73c2bd] via-70% to-[#086e89] bg-clip-text text-transparent">
                    For clinics and special workflows
                  </span>
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </Container>
    </div>
  )
}

function FrequentlyAskedQuestions() {
  return (
    <Container>
      <section id="faqs" className="scroll-mt-8">
        <Subheading className="text-center">
          Frequently asked questions
        </Subheading>
        <Heading as="div" className="mt-2 text-center">
          Practical questions, answered clearly.
        </Heading>
        <div className="mx-auto mt-16 mb-32 max-w-xl space-y-12">
          {faqs.map((faq) => (
            <dl key={faq.question}>
              <dt className="text-sm font-semibold">{faq.question}</dt>
              <dd className="mt-4 text-sm/6 text-gray-600">{faq.answer}</dd>
            </dl>
          ))}
        </div>
      </section>
    </Container>
  )
}

export async function MarketingPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const tier =
    typeof params.tier === 'string'
      ? tiers.find(({ slug }) => slug === params.tier) ?? tiers[0]
      : tiers[0]

  return (
    <main className="overflow-hidden">
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Header />
      <PricingCards />
      <PricingTable selectedTier={tier} />
      <CustomWorkflowSection />
      <FrequentlyAskedQuestions />
      <Footer />
    </main>
  )
}
