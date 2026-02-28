import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

// Render and other cloud Postgres require SSL for external connections.
// Enable SSL when the host is not localhost (connection string has no sslmode already).
const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.DATABASE_SSL !== 'false' &&
    !/^postgres(?:ql)?:\/\/(?:[^@]*@)?(?:localhost|127\.0\.0\.1)(?:\/|$)/i.test(connectionString));

const pool = new pg.Pool({
  connectionString,
  max: 10,
  ...(useSsl && { ssl: { rejectUnauthorized: true } }),
});

export const db = drizzle(pool, { schema });
export * from './schema.js';
