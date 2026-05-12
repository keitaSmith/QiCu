import { fileURLToPath } from 'node:url'

import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

import { provisionAuthUser, type CreateAuthUserInput, type ProvisionedAuthUser } from '@/lib/auth/provisionUser'

export { provisionAuthUser }

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
