import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

function requireSafeSeedEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run development seeds when NODE_ENV is production.')
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run db:seed.')
  }
}

function describeDatabaseUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
  } catch {
    return 'configured DATABASE_URL'
  }
}

async function main() {
  requireSafeSeedEnvironment()

  const [
    schema,
    client,
    practitionersSeed,
    patientsSeed,
    servicesSeed,
    bookingsSeed,
    sessionsSeed,
  ] = await Promise.all([
    import('@/db/schema'),
    import('@/db/client'),
    import('./demoPractitioners'),
    import('./demoPatients'),
    import('./demoServices'),
    import('./demoBookings'),
    import('./demoSessions'),
  ])

  const target = describeDatabaseUrl(process.env.DATABASE_URL!)

  console.log('QiCu development seed')
  console.log(`Target database: ${target}`)
  console.log('Mode: non-destructive inserts with on conflict do nothing')
  console.log('Seeding practitioners, patients, services, bookings, and sessions.')

  try {
    await client.drizzleDb
      .insert(schema.practitioners)
      .values(practitionersSeed.demoPractitioners)
      .onConflictDoNothing()
    console.log(`Practitioners checked: ${practitionersSeed.demoPractitioners.length}`)

    await client.drizzleDb
      .insert(schema.patients)
      .values(patientsSeed.demoPatients)
      .onConflictDoNothing()
    console.log(`Patients checked: ${patientsSeed.demoPatients.length}`)

    await client.drizzleDb
      .insert(schema.services)
      .values(servicesSeed.demoServices)
      .onConflictDoNothing()
    console.log(`Services checked: ${servicesSeed.demoServices.length}`)

    await client.drizzleDb
      .insert(schema.bookings)
      .values(bookingsSeed.demoBookings)
      .onConflictDoNothing()
    console.log(`Bookings checked: ${bookingsSeed.demoBookings.length}`)

    await client.drizzleDb
      .insert(schema.sessions)
      .values(sessionsSeed.demoSessions)
      .onConflictDoNothing()
    console.log(`Sessions checked: ${sessionsSeed.demoSessions.length}`)

    console.log('Development seed completed.')
  } finally {
    await client.drizzlePool.end()
  }
}

main().catch(error => {
  console.error('Development seed failed.')
  console.error(error)
  process.exitCode = 1
})

