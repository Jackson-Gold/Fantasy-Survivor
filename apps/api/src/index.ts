import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedAdminIfEmpty } from './db/seed.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

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
