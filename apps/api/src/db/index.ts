import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

// Render and other cloud Postgres require SSL. Internal URLs often use self-signed certs.
// Use rejectUnauthorized: false so connection works on Render (traffic still encrypted).
const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.DATABASE_SSL !== 'false' &&
    !/^postgres(?:ql)?:\/\/(?:[^@]*@)?(?:localhost|127\.0\.0\.1)(?:\/|$)/i.test(connectionString));

const pool = new pg.Pool({
  connectionString,
  max: 10,
  ...(useSsl && { ssl: { rejectUnauthorized: false } }),
});

export const db = drizzle(pool, { schema });
export * from './schema.js';
