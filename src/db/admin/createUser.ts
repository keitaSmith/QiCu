import { fileURLToPath } from 'node:url'

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

export type CreateAuthUserInput = {
  email: string
  password: string
  name: string
  practitionerId: string
  allowRelink: boolean
}

export type ProvisionedAuthUser = {
  email: string
  practitionerId: string
  practitionerName: string
}

const REQUIRED_ENV_VARS = [
  'QICU_CREATE_USER_EMAIL',
  'QICU_CREATE_USER_PASSWORD',
  'QICU_CREATE_USER_NAME',
  'QICU_CREATE_USER_PRACTITIONER_ID',
] as const

function isTruthy(value?: string | null) {
  return value === 'true'
}

export function requireCreateUserEnvironment(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run auth:create-user.')
  }
}

export function readCreateUserInput(env = process.env): CreateAuthUserInput {
  requireCreateUserEnvironment(env)

  const email = env.QICU_CREATE_USER_EMAIL?.trim().toLowerCase() ?? ''
  const password = env.QICU_CREATE_USER_PASSWORD ?? ''
  const name = env.QICU_CREATE_USER_NAME?.trim() ?? ''
  const practitionerId = env.QICU_CREATE_USER_PRACTITIONER_ID?.trim() ?? ''

  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = env[key]
    return value === undefined || value.trim() === ''
  })

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return {
    email,
    password,
    name,
    practitionerId,
    allowRelink: isTruthy(env.QICU_CREATE_USER_ALLOW_RELINK),
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

export async function provisionAuthUser(input: CreateAuthUserInput): Promise<ProvisionedAuthUser> {
  const [{ and, eq, ne }, client, schema, password, ids] = await Promise.all([
    import('drizzle-orm'),
    import('@/db/client'),
    import('@/db/schema'),
    import('@/lib/auth/password'),
    import('@/db/seeds/ids'),
  ])

  const targetPractitionerDatabaseId =
    ids.demoPractitionerIds[input.practitionerId as keyof typeof ids.demoPractitionerIds]

  if (!targetPractitionerDatabaseId) {
    throw new Error(`Unknown practitioner public ID: ${input.practitionerId}`)
  }

  const { drizzleDb } = client
  const { passwordCredentials, practitioners, users } = schema

  const passwordResult = await password.hashPassword(input.password)
  const now = new Date()

  return drizzleDb.transaction(async (tx) => {
    const [targetPractitioner] = await tx
      .select()
      .from(practitioners)
      .where(eq(practitioners.id, targetPractitionerDatabaseId))
      .limit(1)

    if (!targetPractitioner) {
      throw new Error(`Practitioner ${input.practitionerId} was not found in the database.`)
    }

    const existingUsers = await tx
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1)

    const existingUser = existingUsers[0] ?? null

    if (existingUser) {
      const [existingUserPractitioner] = await tx
        .select()
        .from(practitioners)
        .where(eq(practitioners.userId, existingUser.id))
        .limit(1)

      if (
        existingUserPractitioner &&
        existingUserPractitioner.id !== targetPractitionerDatabaseId &&
        !input.allowRelink
      ) {
        throw new Error(
          `User ${input.email} is already linked to practitioner ${
            existingUserPractitioner.displayName ?? existingUserPractitioner.id
          }. Re-run with QICU_CREATE_USER_ALLOW_RELINK=true to move the link.`,
        )
      }
    }

    if (targetPractitioner.userId && targetPractitioner.userId !== existingUser?.id && !input.allowRelink) {
      throw new Error(
        `Practitioner ${input.practitionerId} is already linked to another user. Re-run with QICU_CREATE_USER_ALLOW_RELINK=true to relink it.`,
      )
    }

    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        authProvider: 'password',
        authProviderUserId: input.email,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: input.name,
          authProvider: 'password',
          authProviderUserId: input.email,
          updatedAt: now,
        },
      })
      .returning()

    if (!user) {
      throw new Error('Failed to create or update the auth user.')
    }

    await tx
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

    if (input.allowRelink) {
      await tx
        .update(practitioners)
        .set({ userId: null, updatedAt: now })
        .where(and(eq(practitioners.userId, user.id), ne(practitioners.id, targetPractitionerDatabaseId)))

      await tx
        .update(practitioners)
        .set({ userId: null, updatedAt: now })
        .where(and(eq(practitioners.id, targetPractitionerDatabaseId), ne(practitioners.userId, user.id)))
    }

    await tx
      .update(practitioners)
      .set({ userId: user.id, updatedAt: now })
      .where(eq(practitioners.id, targetPractitionerDatabaseId))

    return {
      email: user.email,
      practitionerId: input.practitionerId,
      practitionerName: targetPractitioner.displayName,
    }
  })
}

export function printProvisionedAuthUserSummary(
  result: ProvisionedAuthUser,
  log: Pick<typeof console, 'log'> = console,
) {
  log.log('QiCu auth user provisioning completed.')
  log.log(`Email: ${result.email}`)
  log.log(`Practitioner: ${result.practitionerId}`)
  log.log(`Practitioner name: ${result.practitionerName}`)
}

async function main() {
  const input = readCreateUserInput()
  console.log('QiCu auth user provisioning')
  console.log(`Target database: ${describeDatabaseUrl(process.env.DATABASE_URL!)}`)
  console.log('Mode: explicit operator/admin credential provisioning')

  try {
    const result = await provisionAuthUser(input)
    printProvisionedAuthUserSummary(result)
  } finally {
    const { drizzlePool } = await import('@/db/client')
    await drizzlePool.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('Auth user provisioning failed.')
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
