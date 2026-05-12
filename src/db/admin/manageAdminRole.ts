import { fileURLToPath } from 'node:url'

import { loadEnvConfig } from '@next/env'

import {
  grantUserRoleByEmail,
  listUserRolesByEmail,
  revokeUserRoleByEmail,
  type UserRole,
} from '@/lib/repositories/authRepository'

loadEnvConfig(process.cwd())

export type AdminRoleAction = 'grant' | 'revoke'

export type AdminRoleCommandInput = {
  email: string
  action: AdminRoleAction
  role: UserRole
}

export function requireAdminRoleEnvironment(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to manage admin roles.')
  }
}

export function readAdminRoleCommandInput(action: AdminRoleAction, env = process.env): AdminRoleCommandInput {
  requireAdminRoleEnvironment(env)
  const email = env.QICU_ADMIN_ROLE_EMAIL?.trim().toLowerCase() ?? ''
  if (!email) {
    throw new Error('QICU_ADMIN_ROLE_EMAIL is required.')
  }

  return {
    email,
    action,
    role: 'admin',
  }
}

export async function grantAdminRole(input: Pick<AdminRoleCommandInput, 'email' | 'role'>) {
  const result = await grantUserRoleByEmail(input.email, input.role)
  if (!result) {
    throw new Error(`No user found for email ${input.email}.`)
  }
  return {
    email: result.email,
    role: input.role,
    action: 'granted' as const,
  }
}

export async function revokeAdminRole(input: Pick<AdminRoleCommandInput, 'email' | 'role'>) {
  const result = await revokeUserRoleByEmail(input.email, input.role)
  if (!result) {
    throw new Error(`No user found for email ${input.email}.`)
  }
  return {
    email: result.email,
    role: input.role,
    action: result.revoked ? 'revoked' as const : 'not-present' as const,
  }
}

export async function listAdminRoles(email: string) {
  const result = await listUserRolesByEmail(email)
  if (!result) {
    throw new Error(`No user found for email ${email}.`)
  }
  return result
}

export function printAdminRoleSummary(
  result: { email: string; role: UserRole; action: string },
  log: Pick<typeof console, 'log'> = console,
) {
  log.log('QiCu admin role update completed.')
  log.log(`Email: ${result.email}`)
  log.log(`Role: ${result.role}`)
  log.log(`Action: ${result.action}`)
}

async function main() {
  const command = process.argv.includes('--revoke') ? 'revoke' : 'grant'
  const input = readAdminRoleCommandInput(command)
  try {
    const result = command === 'grant'
      ? await grantAdminRole(input)
      : await revokeAdminRole(input)
    printAdminRoleSummary(result)
  } finally {
    const { drizzlePool } = await import('@/db/client')
    await drizzlePool.end()
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('Admin role command failed.')
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
