import { ChevronRightIcon } from '@heroicons/react/16/solid'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { BentoCard } from './bento-card'
import { Button } from './button'
import { Container } from './container'
import { Footer } from './footer'
import { Gradient } from './gradient'
import { Link } from './link'
import { Navbar } from './navbar'
import { ScreenshotFrame } from './screenshot'
import { Heading, Subheading } from './text'

const practiceTypes = [
  'Solo practitioners',
  'Therapy providers',
  'Wellness practices',
  'Beauty studios',
  'Care providers',
]

function Hero() {
  return (
    <div className="relative">
      <Gradient className="absolute inset-2 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
      <Container className="relative">
        <Navbar
          banner={
            <Link
              href="/company"
              className="flex items-center gap-1 rounded-full bg-[color:var(--color-brand-700)]/70 px-3 py-0.5 text-sm/6 font-medium text-white data-hover:bg-[color:var(--color-brand-700)]/60"
            >
              Built around the way small practices actually work
              <ChevronRightIcon className="size-4" />
            </Link>
          }
        />
        <div className="pt-16 pb-24 sm:pt-24 sm:pb-32 md:pt-32 md:pb-48">
          <h1 className="font-display text-6xl/[0.9] font-medium tracking-tight text-balance text-gray-950 sm:text-8xl/[0.8] md:text-9xl/[0.8]">
            Practice management,
            <br />
            made clearer.
          </h1>
          <p className="mt-8 max-w-2xl text-xl/7 font-medium text-gray-950/75 sm:text-2xl/8">
            QiCu helps small healthcare and wellness practitioners manage patients, bookings, services, session notes, tasks, and calendar workflows from one organized dashboard.
          </p>
          <div className="mt-12 flex flex-col gap-x-6 gap-y-4 sm:flex-row">
            <Button href="/dashboard">Open Dashboard</Button>
            <Button variant="secondary" href="/#features">
              Explore Features
            </Button>
          </div>
        </div>
      </Container>
    </div>
  )
}

function PracticeCloud() {
  return (
    <div className="rounded-4xl bg-white/70 px-6 py-8 ring-1 ring-black/5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {practiceTypes.map((type) => (
          <div
            key={type}
            className="rounded-2xl bg-linear-to-b from-white to-[color:var(--color-canvas)] px-5 py-4 text-center text-sm font-medium text-gray-700 ring-1 ring-[color:var(--color-brand-700)]/10"
          >
            {type}
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureSection() {
  return (
    <div className="overflow-hidden" id="features">
      <Container className="pb-24">
        <Heading as="h2" className="max-w-3xl">
          Keep every appointment connected to the work that follows it.
        </Heading>
        <DashboardPreview />
      </Container>
    </div>
  )
}

function DashboardPreview() {
  return (
    <ScreenshotFrame width={1216} height={768} className="mt-16 h-144 sm:h-auto sm:w-304">
      <div className="flex h-full flex-col bg-[linear-gradient(180deg,#fdfefe_0%,#eef7f6_100%)]">
        <div className="flex items-center justify-between border-b border-black/5 px-8 py-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-brand-700)]">
              QiCu dashboard
            </div>
            <div className="mt-2 text-2xl font-medium tracking-tight text-gray-950">
              One workspace for the everyday flow of your practice
            </div>
          </div>
          <div className="rounded-full bg-[color:var(--color-brand-700)]/10 px-4 py-2 text-sm font-medium text-[var(--color-brand-700)]">
            Google Calendar connected
          </div>
        </div>
        <div className="grid flex-1 gap-6 p-8 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              title="Today’s bookings"
              items={[
                '09:00 Patient check-in confirmed',
                '11:30 Follow-up booking pending note',
                '15:00 Rescheduled appointment synced',
              ]}
            />
            <Panel
              title="Patient context"
              items={[
                'Patient profile and history',
                'Linked service and visit details',
                'Related session records',
              ]}
            />
            <Panel
              title="Services"
              items={[
                'Treatment duration and type',
                'Reusable booking structure',
                'Consistent practice setup',
              ]}
            />
            <Panel
              title="Session notes"
              items={[
                'Turn visits into records',
                'Keep patient and booking context',
                'Track unfinished documentation',
              ]}
            />
          </div>
          <div className="grid gap-6">
            <Panel
              title="Tasks"
              items={[
                'Write note after completed booking',
                'Review imported calendar event',
                'Confirm updated appointment status',
              ]}
            />
            <Panel
              title="Calendar workflow"
              items={[
                'Preview imports before adding',
                'Review uncertain matches',
                'Avoid duplicates where possible',
              ]}
            />
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  )
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
      <h3 className="text-sm/6 font-medium text-gray-950">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm/6 text-gray-600">
            <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-[var(--color-brand-700)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FeatureGraphic({
  title,
  lines,
}: {
  title: string
  lines: string[]
}) {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(115,194,189,0.35),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(229,238,238,0.9))] p-8">
      <div className="rounded-3xl bg-white/90 p-5 shadow-lg ring-1 ring-black/5">
        <p className="text-sm font-semibold text-[var(--color-brand-700)]">{title}</p>
        <div className="mt-4 space-y-3">
          {lines.map((line) => (
            <div
              key={line}
              className="rounded-full bg-[color:var(--color-canvas)] px-4 py-3 text-sm text-gray-700 ring-1 ring-black/5"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function WorkflowGraphic() {
  const steps = ['Patient', 'Booking', 'Session', 'Notes', 'Follow-up Tasks']
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.28),transparent_45%)] px-6">
      <div className="flex w-full max-w-xs flex-col gap-3">
        {steps.map((step, index) => (
          <div
            key={step}
            className="rounded-full bg-white/90 px-4 py-3 text-center text-sm font-medium text-gray-800 ring-1 ring-white/10 shadow-md"
          >
            {index + 1}. {step}
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarGraphic() {
  const items = ['Preview imports', 'Review uncertain events', 'Sync new bookings', 'Reflect status changes']
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_bottom_left,rgba(115,194,189,0.2),transparent_40%)] p-8">
      <div className="grid h-full gap-3">
        {items.map((item, index) => (
          <div
            key={item}
            className="rounded-2xl bg-gray-900/75 px-4 py-3 text-sm text-white ring-1 ring-white/10"
            style={{ transform: `translateX(${index % 2 === 0 ? 0 : 18}px)` }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function BentoSection() {
  return (
    <Container>
      <Subheading>Core workflow</Subheading>
      <Heading as="h3" className="mt-2 max-w-3xl">
        Organize patient, booking, and session work in one connected place.
      </Heading>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6 lg:grid-rows-2">
        <BentoCard
          eyebrow="Patients"
          title="Keep patient context organized"
          description="Keep patient profiles, history, and related records organized in one place."
          graphic={
            <FeatureGraphic
              title="Patient Management"
              lines={['Patient profile', 'Booking history', 'Related records']}
            />
          }
          fade={['bottom']}
          className="max-lg:rounded-t-4xl lg:col-span-3 lg:rounded-tl-4xl"
        />
        <BentoCard
          eyebrow="Bookings"
          title="Track appointments with clear status"
          description="Create, edit, cancel, and track appointments with clear booking statuses and overlap protection."
          graphic={
            <FeatureGraphic
              title="Bookings"
              lines={['Confirmed', 'Rescheduled', 'Cancelled', 'No-show status']}
            />
          }
          fade={['bottom']}
          className="lg:col-span-3 lg:rounded-tr-4xl"
        />
        <BentoCard
          eyebrow="Notes"
          title="Turn appointments into session records"
          description="Turn appointments into clean session records linked to the right patient and booking."
          graphic={
            <FeatureGraphic
              title="Session Notes"
              lines={['Patient linked', 'Service linked', 'Visit context saved']}
            />
          }
          className="lg:col-span-2 lg:rounded-bl-4xl"
        />
        <BentoCard
          eyebrow="Tasks"
          title="Keep follow-up work visible"
          description="Surface important follow-up work, like writing notes after a session."
          graphic={
            <FeatureGraphic
              title="Tasks"
              lines={['Notes still to complete', 'Follow-up reminders', 'Visible after bookings']}
            />
          }
          className="lg:col-span-2"
        />
        <BentoCard
          eyebrow="Services"
          title="Structure the treatments you offer"
          description="Manage treatments, durations, and service details used across bookings."
          graphic={
            <FeatureGraphic
              title="Services"
              lines={['Duration', 'Treatment details', 'Reusable across bookings']}
            />
          }
          className="max-lg:rounded-b-4xl lg:col-span-2 lg:rounded-br-4xl"
        />
      </div>
    </Container>
  )
}

function DarkBentoSection() {
  return (
    <div className="mx-2 mt-2 rounded-4xl bg-gray-900 py-32">
      <Container>
        <Subheading dark>Connected workflows</Subheading>
        <Heading as="h3" dark className="mt-2 max-w-3xl">
          Keep the work around every appointment structured and visible.
        </Heading>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6 lg:grid-rows-2">
          <BentoCard
            dark
            eyebrow="Calendar sync"
            title="Review calendar events before they become bookings"
            description="Import existing calendar events, review them before adding them to QiCu, and sync new QiCu bookings back to Google Calendar."
            graphic={<CalendarGraphic />}
            fade={['top']}
            className="max-lg:rounded-t-4xl lg:col-span-4 lg:rounded-tl-4xl"
          />
          <BentoCard
            dark
            eyebrow="Workflow"
            title="Follow the path from patient to task"
            description="QiCu helps practitioners keep patient, booking, session, note, and follow-up task context connected in one workflow."
            graphic={<WorkflowGraphic />}
            className="z-10 overflow-visible! lg:col-span-2 lg:rounded-tr-4xl"
          />
          <BentoCard
            dark
            eyebrow="Daily admin"
            title="Keep unfinished work visible after each visit"
            description="Session notes and follow-up work stay easier to spot after appointments instead of depending on memory."
            graphic={
              <FeatureGraphic
                title="After-session checklist"
                lines={['Complete note', 'Review status', 'Confirm next step']}
              />
            }
            className="lg:col-span-2 lg:rounded-bl-4xl"
          />
          <BentoCard
            dark
            eyebrow="Overview"
            title="See your practice workflow more clearly"
            description="QiCu gives small practitioners one organized workspace for appointments, patient context, notes, services, and calendar workflows."
            graphic={
              <FeatureGraphic
                title="Practice overview"
                lines={['Patients', 'Bookings', 'Sessions', 'Tasks']}
              />
            }
            fade={['top']}
            className="max-lg:rounded-b-4xl lg:col-span-4 lg:rounded-br-4xl"
          />
        </div>
      </Container>
    </div>
  )
}

function AudienceShowcase() {
  return (
    <div className="mx-2 my-24 rounded-4xl bg-gray-900 pt-72 pb-24 lg:pt-36">
      <Container>
        <div className="grid grid-cols-1 lg:grid-cols-[384px_1fr_1fr]">
          <div className="-mt-96 lg:-mt-52">
            <div className="-m-2 rounded-4xl bg-white/15 shadow-[inset_0_0_2px_1px_#ffffff4d] ring-1 ring-black/5 max-lg:mx-auto max-lg:max-w-xs">
              <div className="rounded-4xl p-2 shadow-md shadow-black/5">
                <div className="aspect-3/4 rounded-3xl bg-[radial-gradient(circle_at_top,rgba(115,194,189,0.75),transparent_40%),linear-gradient(180deg,#112123_0%,#0b6e89_100%)] p-8 shadow-2xl outline outline-1 -outline-offset-1 outline-black/10">
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-white/8 p-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-300)]">
                        Built for
                      </p>
                      <p className="mt-4 text-2xl font-medium text-white">
                        Small practices
                      </p>
                    </div>
                    <div className="space-y-3 text-sm text-white/80">
                      <div>Solo practitioners</div>
                      <div>Therapy and care providers</div>
                      <div>Beauty and treatment studios</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex max-lg:mt-16 lg:col-span-2 lg:px-16">
            <div className="mx-auto flex max-w-xl flex-col gap-10 max-lg:text-center">
              <div>
                <Subheading dark>Who it is for</Subheading>
                <p className="mt-6 text-3xl tracking-tight text-white lg:text-4xl">
                  QiCu is designed for practitioners who need a more structured way to manage patients, bookings, session notes, tasks, services, and calendar workflows.
                </p>
              </div>
              <div className="grid gap-4 text-sm/6 text-white/75 sm:grid-cols-2">
                <div>Solo wellness practitioners</div>
                <div>Therapy providers</div>
                <div>Beauty and treatment studios</div>
                <div>Small clinics with simple workflows</div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

export function MarketingHomePage() {
  return (
    <div className="overflow-hidden">
      <Hero />
      <main>
        <Container className="mt-10">
          <PracticeCloud />
        </Container>
        <div className="bg-linear-to-b from-white from-50% to-gray-100 py-32">
          <FeatureSection />
          <BentoSection />
        </div>
        <DarkBentoSection />
      </main>
      <AudienceShowcase />
      <Footer />
    </div>
  )
}
