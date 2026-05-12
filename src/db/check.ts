import { loadEnvConfig } from '@next/env'
import { Pool } from 'pg'

loadEnvConfig(process.cwd())

const expectedTables = [
  'users',
  'auth_sessions',
  'password_credentials',
  'user_roles',
  'practitioners',
  'deletion_groups',
  'patients',
  'services',
  'bookings',
  'sessions',
  'google_integrations',
  'oauth_states',
  'audit_events',
  'email_logs',
]

function requireDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) {
    throw new Error('DATABASE_URL is required to run db:check.')
  }
  return rawUrl
}

function describeDatabaseUrl(rawUrl: string) {
  const url = new URL(rawUrl)
  return {
    display: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`,
    host: url.hostname,
    port: url.port || '(default)',
    database: url.pathname.replace(/^\//, '') || '(none)',
  }
}

async function main() {
  const databaseUrl = requireDatabaseUrl()
  const target = describeDatabaseUrl(databaseUrl)

  console.log('QiCu database check')
  console.log(`Target database: ${target.display}`)
  console.log(`Host: ${target.host}`)
  console.log(`Port: ${target.port}`)
  console.log(`Database: ${target.database}`)
  console.log('Mode: read-only connectivity and migration readiness check')

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    const ping = await pool.query<{ ok: number }>('select 1 as ok')
    console.log(`SELECT 1: ${ping.rows[0]?.ok === 1 ? 'ok' : 'unexpected result'}`)

    const tableResult = await pool.query<{ table_name: string }>(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
          and table_name = any($1)
        order by table_name
      `,
      [expectedTables],
    )

    const found = new Set(tableResult.rows.map(row => row.table_name))
    const missing = expectedTables.filter(table => !found.has(table))

    if (missing.length === 0) {
      console.log(`Expected tables: ok (${expectedTables.length}/${expectedTables.length})`)
    } else {
      console.log(`Expected tables: missing ${missing.length}/${expectedTables.length}`)
      console.log(`Missing tables: ${missing.join(', ')}`)
      console.log('Run npm run db:migrate against this database, then run npm run db:check again.')
    }
  } finally {
    await pool.end()
  }
}

main().catch(error => {
  console.error('Database check failed.')
  console.error(error)
  process.exitCode = 1
})
