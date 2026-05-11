import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

export const DEV_AUTH_EMAIL = 'dev@qicu.local'
export const DEV_AUTH_PASSWORD = 'ChangeMe123!'
export const DEV_AUTH_PRACTITIONER_ID = 'prac-keita-smith'

export function requireSafeDevAuthSeedEnvironment(env = process.env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed the local auth fixture when NODE_ENV is production.')
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run db:seed:auth-dev.')
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

export async function seedDevAuthFixture(log: Pick<typeof console, 'log'> = console) {
  requireSafeDevAuthSeedEnvironment()

  const [{ eq }, client, schema, password, seedIds] = await Promise.all([
    import('drizzle-orm'),
    import('@/db/client'),
    import('@/db/schema'),
    import('@/lib/auth/password'),
    import('./ids'),
  ])

  const { drizzleDb } = client
  const { passwordCredentials, practitioners, users } = schema

  const targetPractitionerDatabaseId = seedIds.demoPractitionerIds[DEV_AUTH_PRACTITIONER_ID]
  if (!targetPractitionerDatabaseId) {
    throw new Error(`Unknown dev auth practitioner fixture: ${DEV_AUTH_PRACTITIONER_ID}`)
  }

  const now = new Date()
  const passwordResult = await password.hashPassword(DEV_AUTH_PASSWORD)

  const [user] = await drizzleDb
    .insert(users)
    .values({
      email: DEV_AUTH_EMAIL,
      name: 'QiCu Dev User',
      authProvider: 'password',
      authProviderUserId: DEV_AUTH_EMAIL,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: 'QiCu Dev User',
        authProvider: 'password',
        authProviderUserId: DEV_AUTH_EMAIL,
        updatedAt: now,
      },
    })
    .returning()

  if (!user) {
    throw new Error('Failed to create or update local dev auth user.')
  }

  await drizzleDb
    .insert(passwordCredentials)
    .values({
      userId: user.id,
      passwordHash: passwordResult.hash,
      passwordAlgorithm: passwordResult.algorithm,
      passwordChangedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: passwordCredentials.userId,
      set: {
        passwordHash: passwordResult.hash,
        passwordAlgorithm: passwordResult.algorithm,
        passwordChangedAt: now,
        updatedAt: now,
      },
    })

  const [targetPractitioner] = await drizzleDb
    .select()
    .from(practitioners)
    .where(eq(practitioners.id, targetPractitionerDatabaseId))
    .limit(1)

  if (!targetPractitioner) {
    throw new Error(`Seeded practitioner ${DEV_AUTH_PRACTITIONER_ID} was not found. Run npm run db:seed first.`)
  }

  if (targetPractitioner.userId && targetPractitioner.userId !== user.id) {
    throw new Error(
      `Seeded practitioner ${DEV_AUTH_PRACTITIONER_ID} is already linked to a different user. Refusing to overwrite it.`,
    )
  }

  await drizzleDb
    .update(practitioners)
    .set({ userId: user.id, updatedAt: now })
    .where(eq(practitioners.id, targetPractitionerDatabaseId))

  log.log('QiCu local development auth fixture seeded.')
  log.log('This account is for local manual testing only and must not be used in production.')
  log.log(`Login email: ${DEV_AUTH_EMAIL}`)
  log.log(`Login password: ${DEV_AUTH_PASSWORD}`)
  log.log(`Linked practitioner: ${DEV_AUTH_PRACTITIONER_ID}`)

  return {
    email: DEV_AUTH_EMAIL,
    practitionerId: DEV_AUTH_PRACTITIONER_ID,
    userId: user.id,
  }
}

async function main() {
  requireSafeDevAuthSeedEnvironment()
  console.log('QiCu local development auth seed')
  console.log(`Target database: ${describeDatabaseUrl(process.env.DATABASE_URL!)}`)
  console.log('Mode: local-only idempotent auth fixture')

  try {
    await seedDevAuthFixture()
  } finally {
    const { drizzlePool } = await import('@/db/client')
    await drizzlePool.end()
  }
}

if (process.env.QICU_RUN_DEV_AUTH_SEED !== 'false') {
  main().catch(error => {
    console.error('Local development auth seed failed.')
    console.error(error)
    process.exitCode = 1
  })
}
