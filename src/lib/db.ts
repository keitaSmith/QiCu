import { Pool } from 'pg';



const connectionString = process.env.DATABASE_URL!;
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export const db =
  global.__pgPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') global.__pgPool = db;
