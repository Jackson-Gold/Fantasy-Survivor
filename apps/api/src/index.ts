import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedAdminIfEmpty } from './db/seed.js';

const PORT = (() => {
  const p = process.env.PORT;
  if (p === undefined || p === '') return 3000;
  const n = parseInt(p, 10);
  return Number.isNaN(n) || n < 0 || n > 65535 ? 3000 : n;
})();

async function main() {
  await runMigrations();
  await seedAdminIfEmpty();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
