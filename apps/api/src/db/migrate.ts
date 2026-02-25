import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString });
  const migrationsDir = join(__dirname, '../../drizzle');
  if (!existsSync(migrationsDir)) {
    await pool.end();
    return;
  }
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    console.log('Applied:', file);
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
