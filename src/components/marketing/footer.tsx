import { Button } from './button'
import { Container } from './container'
import { Gradient } from './gradient'
import { Link } from './link'
import { Logo } from './logo'
import { PlusGrid, PlusGridItem, PlusGridRow } from './plus-grid'
import { Subheading } from './text'

function CallToAction() {
  return (
    <div className="relative pt-20 pb-16 text-center sm:py-24">
      <hgroup>
        <Subheading>Start with the dashboard</Subheading>
        <p className="mt-6 text-3xl font-medium tracking-tight text-gray-950 sm:text-5xl">
          One organized workspace
          <br />
          for the everyday flow of your practice.
        </p>
      </hgroup>
      <p className="mx-auto mt-6 max-w-xl text-sm/6 text-gray-500">
        QiCu is a practice-management workspace for small practitioners, helping connect patients, bookings, session notes, tasks, services, and calendar workflows.
      </p>
      <div className="mt-6">
        <Button className="w-full sm:w-auto" href="/dashboard">
          Open Dashboard
        </Button>
      </div>
    </div>
  )
}

function SitemapHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm/6 font-medium text-gray-950/50">{children}</h3>
}

function SitemapLinks({ children }: { children: React.ReactNode }) {
  return <ul className="mt-6 space-y-4 text-sm/6">{children}</ul>
}

function SitemapLink(props: React.ComponentPropsWithoutRef<typeof Link>) {
  return (
    <li>
      <Link
        {...props}
        className="font-medium text-gray-950 data-hover:text-gray-950/75"
      />
    </li>
  )
}

function Sitemap() {
  return (
    <>
      <div>
        <SitemapHeading>Product</SitemapHeading>
        <SitemapLinks>
          <SitemapLink href="/#features">Features</SitemapLink>
          <SitemapLink href="/pricing">Pricing</SitemapLink>
          <SitemapLink href="/dashboard">Dashboard</SitemapLink>
        </SitemapLinks>
      </div>
      <div>
        <SitemapHeading>Workflow</SitemapHeading>
        <SitemapLinks>
          <SitemapLink href="/#features">Patients</SitemapLink>
          <SitemapLink href="/#features">Bookings</SitemapLink>
          <SitemapLink href="/#features">Session notes</SitemapLink>
        </SitemapLinks>
      </div>
      <div>
        <SitemapHeading>Company</SitemapHeading>
        <SitemapLinks>
          <SitemapLink href="/company">About QiCu</SitemapLink>
          <SitemapLink href="/#features">Calendar sync</SitemapLink>
          <SitemapLink href="/login">Login</SitemapLink>
        </SitemapLinks>
      </div>
      <div>
        <SitemapHeading>Routes</SitemapHeading>
        <SitemapLinks>
          <SitemapLink href="/">Home</SitemapLink>
          <SitemapLink href="/pricing">Pricing</SitemapLink>
          <SitemapLink href="/company">Company</SitemapLink>
        </SitemapLinks>
      </div>
    </>
  )
}

function Copyright() {
  return <div className="text-sm/6 text-gray-950">&copy; {new Date().getFullYear()} QiCu</div>
}

export function Footer() {
  return (
    <footer>
      <Gradient className="relative">
        <div className="absolute inset-2 rounded-4xl bg-white/80" />
        <Container>
          <CallToAction />
          <PlusGrid className="pb-16">
            <PlusGridRow>
              <div className="grid grid-cols-2 gap-y-10 pb-6 lg:grid-cols-6 lg:gap-8">
                <div className="col-span-2 flex">
                  <PlusGridItem className="pt-6 lg:pb-6">
                    <Logo className="h-9" />
                  </PlusGridItem>
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-x-8 gap-y-12 lg:col-span-4 lg:grid-cols-subgrid lg:pt-6">
                  <Sitemap />
                </div>
              </div>
            </PlusGridRow>
            <PlusGridRow className="flex justify-between">
              <div>
                <PlusGridItem className="py-3">
                  <Copyright />
                </PlusGridItem>
              </div>
            </PlusGridRow>
          </PlusGrid>
        </Container>
      </Gradient>
    </footer>
  )
}
