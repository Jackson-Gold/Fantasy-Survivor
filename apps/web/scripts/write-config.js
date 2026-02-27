import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiBaseUrl = (process.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const outDir = `${__dirname}/../public`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(
  `${outDir}/config.json`,
  JSON.stringify({ apiBaseUrl }, null, 2)
);
