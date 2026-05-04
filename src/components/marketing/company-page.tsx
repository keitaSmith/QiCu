import { Button } from './button'
import { Container } from './container'
import { Footer } from './footer'
import { GradientBackground } from './gradient'
import { Navbar } from './navbar'
import { Heading, Lead, Subheading } from './text'

const principleCards = [
  { label: 'Clarity', value: 'Over clutter' },
  { label: 'Workflow', value: 'Practical first' },
  { label: 'Context', value: 'Patient to session' },
  { label: 'Calendar', value: 'Aware, not dependent' },
]

const focusList = [
  {
    name: 'Organized patient context',
    description: 'Keep patient profiles, appointment history, and related session records organized in one workspace.',
  },
  {
    name: 'Clear booking management',
    description: 'Create, edit, cancel, and track bookings with the context you need before, during, and after each appointment.',
  },
  {
    name: 'Connected session notes',
    description: 'Turn appointments into structured session records without losing the connection between the patient, service, and visit.',
  },
  {
    name: 'Visible follow-up tasks',
    description: 'Keep important follow-up work visible, including session notes that still need to be completed.',
  },
  {
    name: 'Service management',
    description: 'Define services, durations, and treatment details so bookings stay structured from the start.',
  },
  {
    name: 'Calendar workflows',
    description: 'Review calendar events before importing them, then keep new QiCu bookings connected with Google Calendar.',
  },
]

function Header() {
  return (
    <Container className="mt-16">
      <Heading as="h1">Built around the way small practices actually work.</Heading>
      <Lead className="mt-6 max-w-3xl">
        QiCu was created to reduce the everyday admin friction that small practitioners face: scattered appointments, patient details in separate places, unfinished notes, and follow-up tasks that depend on memory.
      </Lead>
      <section className="mt-16 grid grid-cols-1 lg:grid-cols-2 lg:gap-12">
        <div className="max-w-lg">
          <h2 className="text-2xl font-medium tracking-tight">Why QiCu exists</h2>
          <p className="mt-6 text-sm/6 text-gray-600">
            QiCu is meant to give practitioners one clear workspace for the daily work of running a small practice. Instead of spreading patient context, bookings, notes, services, and follow-up tasks across different places, the product is being shaped to keep that workflow connected.
          </p>
          <p className="mt-8 text-sm/6 text-gray-600">
            The focus is practical: make appointments easier to manage, keep session records tied to the right visit, and make unfinished work easier to see before it gets lost in the day.
          </p>
        </div>
        <div className="pt-20 lg:row-span-2 lg:-mr-16 xl:mr-auto">
          <div className="-mx-8 grid grid-cols-2 gap-4 sm:-mx-16 sm:grid-cols-4 lg:mx-0 lg:grid-cols-2 lg:gap-4 xl:gap-8">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className={`${item % 2 === 0 ? '-mt-8 lg:-mt-32' : ''} aspect-square overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.55),transparent_35%),linear-gradient(180deg,#ffffff_0%,#e5eeee_100%)] p-5 shadow-xl outline-1 -outline-offset-1 outline-black/10`}
              >
                <div className="flex h-full items-end rounded-lg border border-black/5 bg-white/70 p-4 text-sm font-medium text-gray-700">
                  {item === 1 ? 'Patients' : item === 2 ? 'Bookings' : item === 3 ? 'Session notes' : 'Calendar workflows'}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="max-lg:mt-16 lg:col-span-1">
          <Subheading>Product principles</Subheading>
          <hr className="mt-6 border-t border-gray-200" />
          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            {principleCards.map((principle, index) => (
              <div
                key={principle.label}
                className={`${index < 2 ? 'border-b border-dotted border-gray-200 pb-4' : 'max-sm:border-b max-sm:border-dotted max-sm:border-gray-200 max-sm:pb-4'} flex flex-col gap-y-2`}
              >
                <dt className="text-sm/6 text-gray-600">{principle.label}</dt>
                <dd className="order-first text-3xl font-medium tracking-tight sm:text-4xl">
                  {principle.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </Container>
  )
}

function FocusItem({
  name,
  description,
}: {
  name: string
  description: string
}) {
  return (
    <li className="flex items-start gap-4">
      <div className="mt-1 size-12 rounded-full bg-[linear-gradient(180deg,#d9f3f1_0%,#73c2bd_100%)]" />
      <div className="text-sm/6">
        <h3 className="font-medium">{name}</h3>
        <p className="text-gray-500">{description}</p>
      </div>
    </li>
  )
}

function WorkflowFocus() {
  return (
    <Container className="mt-32">
      <Subheading>Product focus</Subheading>
      <Heading as="h3" className="mt-2">
        Structured around the work that happens before and after every appointment.
      </Heading>
      <Lead className="mt-6 max-w-3xl">
        QiCu is focused on helping practitioners keep patient context, bookings, services, session records, and follow-up tasks easier to manage in one connected workflow.
      </Lead>
      <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div className="max-w-lg">
          <p className="text-sm/6 text-gray-600">
            Small practices rarely need bloated hospital software, but they do need structure. QiCu is being built around the daily flow that practitioners already repeat: booking appointments, checking patient context, recording what happened, and keeping unfinished follow-up visible.
          </p>
          <p className="mt-8 text-sm/6 text-gray-600">
            The goal is not to pretend the work is effortless. It is to make the workflow clearer, more connected, and easier to review at a glance.
          </p>
          <div className="mt-6">
            <Button className="w-full sm:w-auto" href="/dashboard">
              Open Dashboard
            </Button>
          </div>
        </div>
        <div className="max-lg:order-first max-lg:max-w-lg">
          <div className="aspect-3/2 overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.65),transparent_35%),linear-gradient(180deg,#0e2327_0%,#0b6e89_100%)] p-6 shadow-xl outline-1 -outline-offset-1 outline-black/10">
            <div className="grid h-full gap-4 rounded-2xl border border-white/10 bg-white/8 p-5">
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Patient → Booking</div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Booking → Session</div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Session → Notes</div>
              <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">Notes → Follow-up Tasks</div>
            </div>
          </div>
        </div>
      </div>
      <Subheading as="h3" className="mt-24">
        Current focus areas
      </Subheading>
      <hr className="mt-6 border-t border-gray-200" />
      <ul
        role="list"
        className="mx-auto mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        {focusList.map((item) => (
          <FocusItem key={item.name} {...item} />
        ))}
      </ul>
    </Container>
  )
}

function AudienceSection() {
  const audiences = [
    {
      title: 'Who QiCu is for',
      body:
        'QiCu is intended for solo practitioners, small practices, therapy providers, wellness practitioners, beauty and treatment studios, care providers, and small clinics that want a clearer daily workflow.',
    },
    {
      title: 'What QiCu is trying to simplify',
      body:
        'The product is focused on reducing scattered admin by keeping patient, booking, session, task, and calendar workflows connected in one place.',
    },
  ]

  const audienceList = [
    'Solo practitioners',
    'Small practices',
    'Therapy providers',
    'Wellness practitioners',
    'Beauty and treatment studios',
    'Care providers',
  ]

  return (
    <Container className="mt-32">
      <Subheading>Audience</Subheading>
      <Heading as="h3" className="mt-2">
        Designed for small practices first.
      </Heading>
      <Lead className="mt-6 max-w-3xl">
        QiCu should feel like practical software for professionals, not an oversized enterprise system and not a generic startup promise.
      </Lead>
      <Subheading as="h3" className="mt-24">
        Product direction
      </Subheading>
      <hr className="mt-6 border-t border-gray-200" />
      <ul
        role="list"
        className="mx-auto mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2"
      >
        {audiences.map((item) => (
          <li key={item.title}>
            <div className="h-14 rounded-2xl bg-[linear-gradient(90deg,#d9f3f1_0%,#73c2bd_60%,#086e89_100%)]" />
            <p className="mt-6 text-lg font-medium text-gray-950">{item.title}</p>
            <p className="mt-3 max-w-lg text-sm/6 text-gray-500">{item.body}</p>
          </li>
        ))}
      </ul>
      <Subheading as="h3" className="mt-24">
        Practices in scope
      </Subheading>
      <hr className="mt-6 border-t border-gray-200" />
      <ul
        role="list"
        className="mx-auto mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
      >
        {audienceList.map((item) => (
          <FocusItem
            key={item}
            name={item}
            description="A clear practice-management workflow without unnecessary enterprise complexity."
          />
        ))}
      </ul>
    </Container>
  )
}

function DevelopmentStatusCard() {
  return (
    <div className="relative flex aspect-square flex-col justify-end overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.65),transparent_35%),linear-gradient(180deg,#102022_0%,#0a4e61_100%)] sm:aspect-5/4 lg:aspect-3/4">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-3xl bg-linear-to-t from-black/35 from-10% to-transparent to-75% ring-1 ring-gray-950/10 ring-inset lg:from-25%"
      />
      <figure className="relative p-10">
        <blockquote>
          <p className="relative text-xl/7 text-white">
            QiCu is actively being developed with a focus on clearer workflows for patients, bookings, services, session notes, follow-up tasks, and Google Calendar support.
          </p>
        </blockquote>
        <figcaption className="mt-6 border-t border-white/20 pt-6">
          <p className="text-sm/6 font-medium text-white">Current status</p>
          <p className="text-sm/6 font-medium">
            <span className="bg-linear-to-r from-[#d9f3f1] from-28% via-[#73c2bd] via-70% to-[#086e89] bg-clip-text text-transparent">
              Active product development
            </span>
          </p>
        </figcaption>
      </figure>
    </div>
  )
}

function DevelopmentStatus() {
  return (
    <Container className="my-32">
      <Subheading>Status</Subheading>
      <Heading as="h3" className="mt-2">
        Current development focus.
      </Heading>
      <Lead className="mt-6 max-w-3xl">
        QiCu is still being shaped, with the current emphasis on reliable, connected workflows for small-practice admin.
      </Lead>
      <div className="mt-24 grid grid-cols-1 gap-16 lg:grid-cols-[1fr_24rem]">
        <div className="lg:max-w-2xl">
          <Subheading as="h3">In progress</Subheading>
          <div>
            <table className="w-full text-left">
              <colgroup>
                <col className="w-2/3" />
                <col className="w-1/3" />
                <col className="w-0" />
              </colgroup>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Focus area</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="colgroup" colSpan={3} className="px-0 pt-10 pb-0">
                    <div className="-mx-4 rounded-lg bg-gray-50 px-4 py-3 text-sm/6 font-semibold">
                      Core workflow
                    </div>
                  </th>
                </tr>
                <tr className="border-b border-dotted border-gray-200 text-sm/6 font-normal">
                  <td className="px-0 py-4">Patients, bookings, and services</td>
                  <td className="px-0 py-4 text-gray-600">Active</td>
                  <td className="px-0 py-4 text-right">
                    <Button variant="outline" href="/dashboard">
                      View dashboard
                    </Button>
                  </td>
                </tr>
                <tr className="border-b border-dotted border-gray-200 text-sm/6 font-normal">
                  <td className="px-0 py-4">Session notes and follow-up tasks</td>
                  <td className="px-0 py-4 text-gray-600">Active</td>
                  <td className="px-0 py-4 text-right">
                    <Button variant="outline" href="/dashboard">
                      View dashboard
                    </Button>
                  </td>
                </tr>
                <tr className="text-sm/6 font-normal">
                  <td className="px-0 py-4">Google Calendar workflows</td>
                  <td className="px-0 py-4 text-gray-600">In progress</td>
                  <td className="px-0 py-4 text-right">
                    <Button variant="outline" href="/dashboard">
                      View dashboard
                    </Button>
                  </td>
                </tr>
                <tr>
                  <th scope="colgroup" colSpan={3} className="px-0 pt-5 pb-0">
                    <div className="-mx-4 rounded-lg bg-gray-50 px-4 py-3 text-sm/6 font-semibold">
                      Product direction
                    </div>
                  </th>
                </tr>
                <tr className="border-b border-dotted border-gray-200 text-sm/6 font-normal">
                  <td className="px-0 py-4">Pricing and rollout structure</td>
                  <td className="px-0 py-4 text-gray-600">Provisional</td>
                  <td className="px-0 py-4 text-right">
                    <Button variant="outline" href="/pricing">
                      See pricing
                    </Button>
                  </td>
                </tr>
                <tr className="text-sm/6 font-normal">
                  <td className="px-0 py-4">Custom workflow planning</td>
                  <td className="px-0 py-4 text-gray-600">Planned</td>
                  <td className="px-0 py-4 text-right">
                    <Button variant="outline" href="/company">
                      Learn more
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <DevelopmentStatusCard />
      </div>
    </Container>
  )
}

export function MarketingCompanyPage() {
  return (
    <main className="overflow-hidden">
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Header />
      <WorkflowFocus />
      <AudienceSection />
      <DevelopmentStatus />
      <Footer />
    </main>
  )
}
