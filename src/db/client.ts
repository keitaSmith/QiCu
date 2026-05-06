import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

declare global {
  // Keep this separate from src/lib/db.ts so /api/health remains unchanged in Phase A.
  var __qicuDrizzlePool: Pool | undefined
}

const pool =
  global.__qicuDrizzlePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  })

if (process.env.NODE_ENV !== 'production') global.__qicuDrizzlePool = pool

export const drizzleDb = drizzle(pool, { schema })
export { pool as drizzlePool }
