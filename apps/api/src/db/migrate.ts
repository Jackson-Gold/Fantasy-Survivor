import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_TABLE = '_schema_migrations';

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const useSsl =
    process.env.DATABASE_SSL === 'true' ||
    (process.env.DATABASE_SSL !== 'false' &&
      !/^postgres(?:ql)?:\/\/(?:[^@]*@)?(?:localhost|127\.0\.0\.1)(?:\/|$)/i.test(connectionString));
  const pool = new pg.Pool({
    connectionString,
    ...(useSsl && { ssl: { rejectUnauthorized: true } }),
  });

  const tableExists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [MIGRATIONS_TABLE]
  );
  if (tableExists.rows.length === 0) {
    await pool.query(`
      CREATE TABLE "${MIGRATIONS_TABLE}" (
        name varchar(255) PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  const migrationsDir = join(__dirname, '../../drizzle');
  if (!existsSync(migrationsDir)) {
    await pool.end();
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      `SELECT 1 FROM "${MIGRATIONS_TABLE}" WHERE name = $1`,
      [file]
    );
    if (rows.length > 0) {
      console.log('Skip (already applied):', file);
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [file]
      );
      await client.query('COMMIT');
      console.log('Applied:', file);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

async function run() {
  await runMigrations();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
