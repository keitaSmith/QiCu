import { Pool } from 'pg';



const connectionString = process.env.DATABASE_URL!;
declare global {
  var __pgPool: Pool | undefined;
}

export const db =
  global.__pgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') global.__pgPool = db;
